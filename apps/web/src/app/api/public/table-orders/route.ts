import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase/server'
import { sanitizeForLog } from '@/lib/logging/safe-log'
import {
  validateModifierSelections,
  type CheckoutModifier,
  type ModifierSelectionError,
} from '@/lib/menu/checkout-modifiers'
import { generateOrderNumber } from '@/lib/orders/order-number'
import {
  MAX_ITEM_NOTES_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_MERGED_QUANTITY,
  MAX_MODIFIERS_PER_ITEM,
  MAX_ORDER_NOTES_LENGTH,
  MAX_TABLE_ORDER_ITEMS,
  MIN_ITEM_QUANTITY,
  lineTotalCents,
  mergeTableOrderItems,
} from '@/lib/pos/table-orders'

export const runtime = 'nodejs'

/**
 * Public table-QR order creation.
 *
 * The QR token is the capability: there is no login. Security therefore rests
 * on (a) an opaque 32-hex token resolved server-side, (b) an active-table
 * check, (c) re-pricing every line from the database, (d) the same modifier
 * requiredness/maximum validation the checkout uses, and (e) a per-table rate
 * limit. Nothing the client sends about money is trusted.
 *
 * The order is intentionally created `pending` with no payment row: the diner
 * pays at the counter, and the POS settles it (pending → paid). The kitchen
 * display shows pending dine-in tickets immediately.
 */

const TableOrderItemSchema = z.object({
  // Seeded menu/modifier ids are UUID-shaped but not RFC 4122 v4; `z.uuid()`
  // rejects them. `z.guid()` accepts any 8-4-4-4-12 hex shape and the database
  // still enforces membership. See the POS order route for the same fix.
  menu_item_id: z.guid(),
  quantity: z
    .number()
    .int()
    .min(MIN_ITEM_QUANTITY)
    .max(MAX_ITEM_QUANTITY),
  modifier_ids: z.array(z.guid()).max(MAX_MODIFIERS_PER_ITEM).default([]),
  notes: z.string().trim().max(MAX_ITEM_NOTES_LENGTH).optional(),
})

const TableOrderSchema = z.object({
  table_token: z.string().trim().min(16).max(128),
  pax: z.number().int().min(1).max(50),
  customer_name: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(MAX_ORDER_NOTES_LENGTH).optional(),
  items: z.array(TableOrderItemSchema).min(1).max(MAX_TABLE_ORDER_ITEMS),
  /**
   * Client-generated key for this submission. A retry (lost response, double
   * tap) returns the order that already landed instead of creating a duplicate.
   * Optional so a page loaded before this deploy still works, unguarded.
   */
  idempotency_key: z.string().trim().min(16).max(128).optional(),
})

type ExistingOrder = {
  id: string
  order_number: string
  display_code: string | null
  total_cents: number
  pax: number | null
  table_label: string | null
  table_id: string | null
  status: string | null
  payment_method: string | null
}

function existingOrderPayload(order: ExistingOrder) {
  return {
    order_id: order.id,
    order_number: order.order_number,
    display_code: order.display_code,
    total_cents: order.total_cents,
    table_label: order.table_label,
    pax: order.pax,
    // The real status, never a literal: a retried create after the diner has
    // claimed the order must say `paid`, or the success screen would ask them
    // to pay a second time.
    status: order.status,
    // The recorded method too: a cashier-settled order must not read as a
    // received QR payment on the success screen.
    payment_method: order.payment_method,
    duplicate: true,
  }
}

type MenuRow = {
  id: string
  name: string
  price_cents: number
  is_available: boolean
}

type ModifierRow = CheckoutModifier & {
  price_delta_cents: number
  is_available: boolean
}

type JunctionRow = {
  menu_item_id: string
  modifier_group_id: string
  is_required: boolean
}

type GroupRow = {
  id: string
  name: string
  min_selections: number
  max_selections: number
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = TableOrderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const input = parsed.data
    const supabase = getServiceClient()

    // ── 1. Token → active table (never enumerated via PostgREST) ──────────
    const { data: table, error: tableError } = await supabase
      .from('restaurant_tables')
      .select('id, label, is_active')
      .eq('qr_token', input.table_token)
      .maybeSingle()

    if (tableError) {
      console.error('[API/TableOrder] Table lookup failed:', sanitizeForLog(tableError))
      return NextResponse.json({ error: 'Unable to validate table' }, { status: 500 })
    }
    if (!table || !table.is_active) {
      return NextResponse.json(
        { error: 'This table QR is not active. Please ask a staff member.' },
        { status: 404 }
      )
    }

    // ── 2. Idempotent retry ────────────────────────────────────────────────
    // Checked before the rate limit: a retry of an order that already landed
    // must return that order even when the table has hit its 4 / 5 min cap.
    if (input.idempotency_key) {
      const { data: existing, error: existingError } = await supabase
        .from('orders')
        .select(
          'id, order_number, display_code, total_cents, pax, table_label, table_id, status, payment_method'
        )
        .eq('idempotency_key', input.idempotency_key)
        .maybeSingle()

      if (existingError) {
        console.error('[API/TableOrder] Idempotency lookup failed:', sanitizeForLog(existingError))
        return NextResponse.json({ error: 'Unable to place order' }, { status: 500 })
      }
      if (existing) {
        if (existing.table_id !== table.id) {
          return NextResponse.json(
            { error: 'This order key was already used at another table' },
            { status: 409 }
          )
        }
        return NextResponse.json(existingOrderPayload(existing as ExistingOrder), {
          status: 200,
        })
      }
    }

    // The database serializes the per-table rate limit with creation. Checking
    // it here would reject a simultaneous retry just before the original order
    // becomes visible, even though both requests use the same idempotency key.

    // ── 4. Normalise lines ────────────────────────────────────────────────
    const lineItems = mergeTableOrderItems(input.items)
    if (lineItems.some((item) => item.quantity > MAX_MERGED_QUANTITY)) {
      return NextResponse.json(
        { error: 'One of the items has too large a quantity' },
        { status: 400 }
      )
    }

    const menuItemIds = [...new Set(lineItems.map((item) => item.menu_item_id))]
    const modifierIds = [...new Set(lineItems.flatMap((item) => item.modifier_ids))]

    // ── 5. Re-price from the database ─────────────────────────────────────
    const [menuResult, modifierResult] = await Promise.all([
      supabase
        .from('menu_items')
        .select('id, name, price_cents, is_available')
        .in('id', menuItemIds),
      modifierIds.length > 0
        ? supabase
            .from('modifiers')
            .select('id, name, price_delta_cents, modifier_group_id, is_available')
            .in('id', modifierIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (menuResult.error || modifierResult.error) {
      console.error(
        '[API/TableOrder] Menu validation failed:',
        sanitizeForLog(menuResult.error ?? modifierResult.error)
      )
      return NextResponse.json({ error: 'Unable to validate prices' }, { status: 500 })
    }

    const menuById = new Map(
      ((menuResult.data ?? []) as MenuRow[]).map((item) => [item.id, item])
    )
    const unavailable = lineItems
      .filter((item) => {
        const menuItem = menuById.get(item.menu_item_id)
        return !menuItem || !menuItem.is_available
      })
      .map((item) => menuById.get(item.menu_item_id)?.name ?? 'An item')

    if (unavailable.length > 0) {
      return NextResponse.json(
        { error: `${unavailable[0]} is no longer available` },
        { status: 400 }
      )
    }

    const modifiersById = new Map<string, ModifierRow>(
      ((modifierResult.data ?? []) as ModifierRow[]).map((modifier) => [
        modifier.id,
        modifier,
      ])
    )

    if ([...modifiersById.values()].some((modifier) => !modifier.is_available)) {
      return NextResponse.json(
        { error: 'An option you selected is no longer available' },
        { status: 400 }
      )
    }

    const { data: junctions, error: junctionsError } = await supabase
      .from('menu_item_modifier_groups')
      .select('menu_item_id, modifier_group_id, is_required')
      .in('menu_item_id', menuItemIds)

    if (junctionsError) {
      console.error('[API/TableOrder] Modifier junction fetch failed:', sanitizeForLog(junctionsError))
      return NextResponse.json({ error: 'Unable to validate options' }, { status: 500 })
    }

    const junctionRows = (junctions ?? []) as JunctionRow[]
    const groupIds = [...new Set(junctionRows.map((row) => row.modifier_group_id))]

    const { data: groups, error: groupsError } = groupIds.length
      ? await supabase
          .from('modifier_groups')
          .select('id, name, min_selections, max_selections')
          .in('id', groupIds)
      : { data: [], error: null }

    if (groupsError) {
      console.error('[API/TableOrder] Modifier group fetch failed:', sanitizeForLog(groupsError))
      return NextResponse.json({ error: 'Unable to validate options' }, { status: 500 })
    }

    const groupsById = new Map(
      ((groups ?? []) as GroupRow[]).map((group) => [group.id, group])
    )

    const validatedLines = lineItems.map((item) => {
      const menuItem = menuById.get(item.menu_item_id)!
      const itemGroups = junctionRows
        .filter((row) => row.menu_item_id === item.menu_item_id)
        .flatMap((row) => {
          const group = groupsById.get(row.modifier_group_id)
          return group
            ? [{ ...group, is_required: row.is_required }]
            : []
        })

      const selectionError = validateModifierSelections({
        itemName: menuItem.name,
        groups: itemGroups,
        selectedModifierIds: item.modifier_ids,
        modifiersById,
      })
      if (selectionError) {
        return { error: selectionError }
      }

      const deltas = item.modifier_ids.map(
        (id) => modifiersById.get(id)?.price_delta_cents ?? 0
      )
      return {
        item,
        menuItem,
        lineTotalCents: lineTotalCents(menuItem.price_cents, deltas, item.quantity),
      }
    })

    const invalidLine = validatedLines.find(
      (line): line is { error: ModifierSelectionError } => 'error' in line
    )
    if (invalidLine) {
      return NextResponse.json(
        { error: invalidLine.error.message, code: invalidLine.error.code },
        { status: 400 }
      )
    }

    const priced = validatedLines as Array<{
      item: (typeof lineItems)[number]
      menuItem: MenuRow
      lineTotalCents: number
    }>

    const subtotalCents = priced.reduce((sum, line) => sum + line.lineTotalCents, 0)

    // Save the complete ticket and its completion event in one transaction.
    // Every price and modifier snapshot below came from the database above.
    const lines = priced.map((line) => ({
      menu_item_id: line.menuItem.id,
      menu_item_name: line.menuItem.name,
      menu_item_price_cents: line.menuItem.price_cents,
      quantity: line.item.quantity,
      notes: line.item.notes ?? null,
      modifiers: line.item.modifier_ids.map((id) => {
        const modifier = modifiersById.get(id)!
        return {
          modifier_id: modifier.id,
          modifier_name: modifier.name,
          modifier_price_delta_cents: modifier.price_delta_cents,
        }
      }),
    }))

    const { data: result, error: orderError } = await supabase.rpc('create_table_qr_order', {
      p_order: {
        order_number: generateOrderNumber(),
        table_id: table.id,
        pax: input.pax,
        customer_name: input.customer_name || null,
        notes: input.notes ?? null,
        subtotal_cents: subtotalCents,
        idempotency_key: input.idempotency_key ?? null,
      },
      p_lines: lines,
    })

    if (orderError || !result) {
      // A legacy writer may have committed the same key while this request was
      // in progress. The new RPC itself serializes retries before rate limiting.
      if (
        (orderError as { code?: string } | null)?.code === '23505' &&
        input.idempotency_key
      ) {
        const { data: existing } = await supabase
          .from('orders')
          .select(
            'id, order_number, display_code, total_cents, pax, table_label, table_id, status, payment_method'
          )
          .eq('idempotency_key', input.idempotency_key)
          .maybeSingle()
        if (existing && existing.table_id === table.id) {
          return NextResponse.json(existingOrderPayload(existing as ExistingOrder), {
            status: 200,
          })
        }
      }

      const message = orderError?.message ?? ''
      if (message.includes('table_order_rate_limited')) {
        return NextResponse.json(
          { error: 'Too many orders for this table. Please call a staff member.' },
          { status: 429 }
        )
      }
      if (message.includes('table_inactive')) {
        return NextResponse.json(
          { error: 'This table QR is not active. Please ask a staff member.' },
          { status: 409 }
        )
      }
      if (message.includes('idempotency_key_conflict')) {
        return NextResponse.json(
          { error: 'This order key was already used at another table' },
          { status: 409 }
        )
      }
      if (
        message.includes('table_order_item_unavailable') ||
        message.includes('table_order_invalid_modifier')
      ) {
        return NextResponse.json(
          { error: 'The menu changed while you were ordering. Please review it and try again.' },
          { status: 409 }
        )
      }
      if (message.includes('table_order_total_mismatch')) {
        return NextResponse.json(
          { error: 'Menu prices changed. Please review your order and try again.' },
          { status: 409 }
        )
      }
      if (
        message.includes('invalid_table_order') ||
        message.includes('table_order_total_too_large')
      ) {
        return NextResponse.json(
          { error: 'This order is too large. Please split it or call a staff member.' },
          { status: 400 }
        )
      }
      console.error('[API/TableOrder] Order transaction failed:', sanitizeForLog(orderError?.message))
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (err) {
    console.error('[API/TableOrder] Unexpected error:', sanitizeForLog(err instanceof Error ? err.message : err))
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
