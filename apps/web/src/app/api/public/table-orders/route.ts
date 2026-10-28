import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase/server'
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

const RATE_WINDOW_MS = 5 * 60 * 1000
const MAX_ORDERS_PER_WINDOW = 4

type ExistingOrder = {
  id: string
  order_number: string
  display_code: string | null
  total_cents: number
  pax: number | null
  table_label: string | null
  table_id: string | null
}

function existingOrderPayload(order: ExistingOrder) {
  return {
    order_id: order.id,
    order_number: order.order_number,
    display_code: order.display_code,
    total_cents: order.total_cents,
    table_label: order.table_label,
    pax: order.pax,
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
      console.error('[API/TableOrder] Table lookup failed:', tableError)
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
          'id, order_number, display_code, total_cents, pax, table_label, table_id'
        )
        .eq('idempotency_key', input.idempotency_key)
        .maybeSingle()

      if (existingError) {
        console.error('[API/TableOrder] Idempotency lookup failed:', existingError)
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

    // ── 3. Per-table rate limit ────────────────────────────────────────────
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { data: recent, error: rateError } = await supabase
      .from('orders')
      .select('created_at')
      .eq('table_id', table.id)
      .eq('delivery_type', 'dine_in')
      .eq('source', 'web')
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(MAX_ORDERS_PER_WINDOW)

    if (rateError) {
      console.error('[API/TableOrder] Rate check failed:', rateError)
      return NextResponse.json({ error: 'Unable to place order' }, { status: 500 })
    }

    const recentOrders = (recent ?? []) as { created_at: string }[]
    if (recentOrders.length >= MAX_ORDERS_PER_WINDOW) {
      return NextResponse.json(
        { error: 'Too many orders for this table. Please call a staff member.' },
        { status: 429 }
      )
    }

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
        menuResult.error ?? modifierResult.error
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
      console.error('[API/TableOrder] Modifier junction fetch failed:', junctionsError)
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
      console.error('[API/TableOrder] Modifier group fetch failed:', groupsError)
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

    // ── 6. Create the order ───────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: generateOrderNumber(),
        customer_id: null,
        customer_name: input.customer_name || null,
        status: 'pending',
        source: 'web',
        delivery_type: 'dine_in',
        table_id: table.id,
        table_label: table.label,
        pax: input.pax,
        fulfillment_type: 'asap',
        order_kind: 'standard',
        dispatch_status: 'not_ready',
        subtotal_cents: subtotalCents,
        delivery_fee_cents: 0,
        discount_cents: 0,
        total_cents: subtotalCents,
        notes: input.notes ?? null,
        include_cutlery: false,
        idempotency_key: input.idempotency_key ?? null,
      })
      .select('id, order_number, display_code')
      .single()

    if (orderError || !order) {
      // A concurrent retry with the same key lost the race to the unique
      // index: the other request created the order, so return that one.
      if (
        (orderError as { code?: string } | null)?.code === '23505' &&
        input.idempotency_key
      ) {
        const { data: existing } = await supabase
          .from('orders')
          .select(
            'id, order_number, display_code, total_cents, pax, table_label, table_id'
          )
          .eq('idempotency_key', input.idempotency_key)
          .maybeSingle()
        if (existing && existing.table_id === table.id) {
          return NextResponse.json(existingOrderPayload(existing as ExistingOrder), {
            status: 200,
          })
        }
      }

      // The BEFORE INSERT trigger enforces the same limit under a per-table
      // advisory lock. Map its exception to the same 429 the pre-check uses.
      const message = orderError?.message ?? ''
      if (message.includes('table_order_rate_limited')) {
        return NextResponse.json(
          { error: 'Too many orders for this table. Please call a staff member.' },
          { status: 429 }
        )
      }
      console.error('[API/TableOrder] Order insert failed:', orderError)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Insert all lines in one statement, then all add-ons in one statement.
    // Generating the line ids here keeps each line's modifiers unambiguously
    // attached (two lines can share a dish with different options) and cuts a
    // submit from up to 100 round-trips to two, shrinking the window in which
    // a crash would leave an item-less ticket.
    const itemRows = priced.map((line) => ({
      id: crypto.randomUUID(),
      order_id: order.id,
      menu_item_id: line.menuItem.id,
      menu_item_name: line.menuItem.name,
      menu_item_price_cents: line.menuItem.price_cents,
      quantity: line.item.quantity,
      line_total_cents: line.lineTotalCents,
      notes: line.item.notes ?? null,
    }))

    const { error: itemError } = await supabase
      .from('order_items')
      .insert(itemRows)

    if (itemError) {
      console.error('[API/TableOrder] Order item insert failed:', itemError)
      await supabase.from('orders').delete().eq('id', order.id)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    const modifierRows = priced.flatMap((line, index) =>
      line.item.modifier_ids.map((id) => {
        const modifier = modifiersById.get(id)!
        return {
          order_item_id: itemRows[index].id,
          modifier_id: modifier.id,
          modifier_name: modifier.name,
          modifier_price_delta_cents: modifier.price_delta_cents,
        }
      })
    )

    if (modifierRows.length > 0) {
      const { error: modifierError } = await supabase
        .from('order_item_modifiers')
        .insert(modifierRows)

      if (modifierError) {
        console.error('[API/TableOrder] Modifier insert failed:', modifierError)
        await supabase.from('orders').delete().eq('id', order.id)
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
      }
    }

    await supabase.from('order_events').insert({
      order_id: order.id,
      event_type: 'table_order_placed',
      actor_id: null,
      new_value: {
        table_id: table.id,
        table_label: table.label,
        pax: input.pax,
        source_channel: 'table_qr',
        total_cents: subtotalCents,
      },
    })

    return NextResponse.json(
      {
        order_id: order.id,
        order_number: order.order_number,
        display_code: order.display_code,
        total_cents: subtotalCents,
        table_label: table.label,
        pax: input.pax,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[API/TableOrder] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
