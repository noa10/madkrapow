import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { generateOrderNumber } from '@/lib/orders/order-number'
import {
  validateModifierSelections,
  type CheckoutModifier,
  type ModifierSelectionError,
} from '@/lib/menu/checkout-modifiers'
import {
  MAX_ITEM_NOTES_LENGTH,
  MAX_MERGED_QUANTITY,
  MAX_MODIFIERS_PER_ITEM,
  mergeTableOrderItems,
} from '@/lib/pos/table-orders'

const PosOrderItemSchema = z.object({
  // Seeded menu/modifier ids are UUID-shaped but not RFC 4122 v4 (the fixture
  // rows use ids like 00000004-0000-0000-0000-000000000001). `z.uuid()` rejects
  // those, which silently blocked every POS order; `z.guid()` accepts any
  // 8-4-4-4-12 hex shape. The database still enforces membership by FK.
  menu_item_id: z.guid(),
  quantity: z.number().int().min(1).max(99),
  modifier_ids: z.array(z.guid()).max(MAX_MODIFIERS_PER_ITEM).default([]),
  notes: z.string().trim().max(MAX_ITEM_NOTES_LENGTH).optional(),
})

const PosOrderSchema = z
  .object({
    items: z.array(PosOrderItemSchema).min(1).max(50),
    /** Dine-in (table + pax) or take-away (customer name). */
    order_type: z.enum(['dine_in', 'take_away']).default('take_away'),
    table_id: z.guid().optional(),
    pax: z.number().int().min(1).max(50).optional(),
    /**
     * How the customer paid. Required: a POS ticket is only created once the
     * money is in, because the kitchen starts preparing as soon as the order
     * lands.
     */
    payment_method: z.enum(['cash', 'qr_pay']),
    customer_name: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.order_type === 'dine_in') {
      if (!data.table_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['table_id'],
          message: 'A table is required for dine-in orders',
        })
      }
      if (data.pax == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pax'],
          message: 'Pax is required for dine-in orders',
        })
      }
    }
  })
  // Collapse duplicate lines with the same options and note so price
  // re-validation and totals stay exact (different add-ons stay separate).
  .transform((data) => ({
    ...data,
    items: mergeTableOrderItems(data.items),
  }))

/**
 * Error codes the RPC can raise for a bad-but-recoverable request. The route
 * validates all of these before calling, so one reaching here means a
 * concurrent menu/table change; return 400 rather than 500.
 */
const POS_RPC_USER_ERRORS = [
  'invalid_order',
  'invalid_payment_method',
  'invalid_order_number',
  'invalid_items',
  'invalid_item',
  'invalid_modifier_payload',
  'duplicate_modifier',
  'item_unavailable',
  'modifier_unavailable',
  'invalid_modifier',
  'too_many_modifiers',
  'required_modifier_missing',
] as const

/**
 * Counter POS order creation.
 *
 * Two order types share the same price re-validation and payment recording:
 *
 * - `dine_in`  → `delivery_type='dine_in'`, table + pax snapshot, customer
 *                name optional. Multiple rounds per table are allowed.
 * - `take_away` → the original behaviour: `self_pickup`, customer name or
 *                `Walk-in`.
 *
 * Prices are NEVER taken from the client: the route re-reads menu_items from
 * the database and recomputes the total. Orders are created as source='counter'
 * and always paid: status='paid', with a payments row recording cash/qr_pay.
 *
 * Pay-later was removed: the kitchen starts preparing as soon as a ticket
 * lands, so an unpaid POS order served food before anyone had paid for it.
 * Pending counter orders can still exist from before this change, and table-QR
 * "pay at counter" orders are pending by design; both settle from the POS
 * table board / unpaid take-away list (`settle_dine_in_order`).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, ['admin', 'manager', 'cashier'])
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = PosOrderSchema.safeParse(body)
    if (!parsed.success) {
      // A POS tab loaded before pay-later was removed still sends
      // `payment_timing` and no `payment_method`. "Invalid request" would leave
      // the cashier retrying; say what actually fixes it.
      const stalePayLaterPage =
        typeof body === 'object' &&
        body !== null &&
        'payment_timing' in body &&
        !('payment_method' in body)
      return NextResponse.json(
        {
          error: stalePayLaterPage
            ? 'Reload the POS to update before charging — this page is running an older version.'
            : 'Invalid request',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      )
    }
    const {
      items,
      order_type,
      table_id,
      pax,
      payment_method,
      customer_name,
      notes,
    } = parsed.data

    // The transform above collapses duplicate rows; a crafted payload could
    // still push one dish past the per-line cap.
    if (items.some((item) => item.quantity > MAX_MERGED_QUANTITY)) {
      return NextResponse.json(
        { error: 'One of the items has too large a quantity' },
        { status: 400 }
      )
    }

    // Re-validate every item and add-on from the database. The client payload
    // is never trusted for money: base prices, modifier deltas, membership,
    // required minimums and maximums are all checked server-side.
    const menuItemIds = [...new Set(items.map((item) => item.menu_item_id))]
    const modifierIds = [...new Set(items.flatMap((item) => item.modifier_ids))]

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
      console.error('[API/POS] Menu validation failed:', menuResult.error ?? modifierResult.error)
      return NextResponse.json({ error: 'Failed to validate menu items' }, { status: 500 })
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

    const menuById = new Map<string, MenuRow>(
      ((menuResult.data ?? []) as MenuRow[]).map((item) => [item.id, item])
    )
    const unavailable = items
      .filter((item) => {
        const menuItem = menuById.get(item.menu_item_id)
        return !menuItem || !menuItem.is_available
      })
      .map((item) => menuById.get(item.menu_item_id)?.name ?? item.menu_item_id)
    if (unavailable.length > 0) {
      return NextResponse.json(
        { error: 'Some items are unavailable', items: unavailable },
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
        { error: 'An add-on you selected is no longer available' },
        { status: 400 }
      )
    }

    const { data: junctions, error: junctionsError } = await supabase
      .from('menu_item_modifier_groups')
      .select('menu_item_id, modifier_group_id, is_required')
      .in('menu_item_id', menuItemIds)
    if (junctionsError) {
      console.error('[API/POS] Modifier junction fetch failed:', junctionsError)
      return NextResponse.json({ error: 'Failed to validate add-ons' }, { status: 500 })
    }

    const junctionRows = (junctions ?? []) as JunctionRow[]
    const groupIds = [...new Set(junctionRows.map((row) => row.modifier_group_id))]
    let groupRows: GroupRow[] = []
    if (groupIds.length > 0) {
      const { data: groups, error: groupsError } = await supabase
        .from('modifier_groups')
        .select('id, name, min_selections, max_selections')
        .in('id', groupIds)
      if (groupsError) {
        console.error('[API/POS] Modifier group fetch failed:', groupsError)
        return NextResponse.json({ error: 'Failed to validate add-ons' }, { status: 500 })
      }
      groupRows = (groups ?? []) as GroupRow[]
    }
    const groupsById = new Map(groupRows.map((group) => [group.id, group]))

    const validatedLines = items.map((item) => {
      const menuItem = menuById.get(item.menu_item_id)!
      const itemGroups = junctionRows
        .filter((row) => row.menu_item_id === item.menu_item_id)
        .flatMap((row) => {
          const group = groupsById.get(row.modifier_group_id)
          return group ? [{ ...group, is_required: row.is_required }] : []
        })

      const selectionError = validateModifierSelections({
        itemName: menuItem.name,
        groups: itemGroups,
        selectedModifierIds: item.modifier_ids,
        modifiersById,
      })
      if (selectionError) return { error: selectionError }

      return { item, menuItem }
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
      item: (typeof items)[number]
      menuItem: MenuRow
    }>

    // Integer-cents arithmetic only; the RPC re-prices from the database and
    // returns the authoritative total.
    // Dine-in must point at an active table; the label is snapshotted so the
    // receipt still reads correctly after a rename or deactivation.
    let tableLabel: string | null = null
    if (order_type === 'dine_in') {
      const { data: table, error: tableError } = await supabase
        .from('restaurant_tables')
        .select('id, label, is_active')
        .eq('id', table_id!)
        .maybeSingle()

      if (tableError) {
        console.error('[API/POS] Table fetch failed:', tableError)
        return NextResponse.json({ error: 'Failed to validate table' }, { status: 500 })
      }
      if (!table || !table.is_active) {
        return NextResponse.json(
          { error: 'That table is not available. Pick another table.' },
          { status: 400 }
        )
      }
      tableLabel = table.label as string
    }

    const orderNumber = generateOrderNumber()

    // One transaction owns the header, lines, add-ons, payment and audit
    // event. A failure at any point rolls all of it back, so there is no
    // half-written ticket and no order without a payment row.
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'create_pos_order',
      {
        p_actor_id: user.id,
        p_order: {
          order_number: orderNumber,
          order_type,
          table_id: order_type === 'dine_in' ? table_id : null,
          pax: order_type === 'dine_in' ? pax : null,
          payment_method,
          customer_name:
            order_type === 'dine_in'
              ? customer_name || null
              : customer_name || 'Walk-in',
          notes: notes ?? null,
        },
        p_items: priced.map((line) => ({
          menu_item_id: line.menuItem.id,
          quantity: line.item.quantity,
          modifier_ids: line.item.modifier_ids,
          notes: line.item.notes ?? null,
        })),
      }
    )

    if (rpcError || !rpcData) {
      const message = rpcError?.message ?? ''

      // The table was deactivated between the lookup and the insert; the RPC's
      // row lock plus migration 064's trigger reject the order.
      if (message.includes('table_inactive')) {
        return NextResponse.json(
          { error: 'That table is not available. Pick another table.' },
          { status: 409 }
        )
      }

      // The route validates all of these before the RPC; reaching one here
      // means a concurrent menu/table change. Return a 400 rather than a 500.
      const userError = POS_RPC_USER_ERRORS.find((code) => message.includes(code))
      if (userError) {
        return NextResponse.json(
          {
            error:
              userError === 'item_unavailable'
                ? 'Some items are unavailable'
                : 'The selected items or add-ons are no longer available. Please review the order.',
            code: userError,
          },
          { status: 400 }
        )
      }

      console.error('[API/POS] Atomic order create failed:', rpcError)
      return NextResponse.json(
        {
          error: 'The order was not created. Please retry.',
          order_number: orderNumber,
        },
        { status: 500 }
      )
    }

    const created = rpcData as {
      order_id: string
      order_number: string
      display_code: string
      total_cents: number
      table_label: string | null
      pax: number | null
    }

    return NextResponse.json(
      {
        order_id: created.order_id,
        order_number: created.order_number,
        display_code: created.display_code,
        total_cents: created.total_cents,
        order_type,
        payment_method,
        status: 'paid',
        table_label: created.table_label ?? tableLabel,
        pax: created.pax ?? (order_type === 'dine_in' ? pax ?? null : null),
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[API/POS] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
