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
  lineTotalCents,
  mergeTableOrderItems,
} from '@/lib/pos/table-orders'

const PosOrderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  modifier_ids: z.array(z.string().uuid()).max(MAX_MODIFIERS_PER_ITEM).default([]),
  notes: z.string().trim().max(MAX_ITEM_NOTES_LENGTH).optional(),
})

const PosOrderSchema = z
  .object({
    items: z.array(PosOrderItemSchema).min(1).max(50),
    /** Dine-in (table + pax) or take-away (customer name). */
    order_type: z.enum(['dine_in', 'take_away']).default('take_away'),
    table_id: z.string().uuid().optional(),
    pax: z.number().int().min(1).max(50).optional(),
    /** Pay now (default) or send the ticket and collect later. */
    payment_timing: z.enum(['pay_now', 'pay_later']).default('pay_now'),
    payment_method: z.enum(['cash', 'qr_pay']).optional(),
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
    if (data.payment_timing === 'pay_now' && !data.payment_method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payment_method'],
        message: 'Choose a payment method or send the order as pay-later',
      })
    }
    if (data.payment_timing === 'pay_later' && data.payment_method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['payment_method'],
        message: 'A payment method is only used when paying now',
      })
    }
  })
  // Collapse duplicate lines with the same options and note so price
  // re-validation and totals stay exact (different add-ons stay separate).
  .transform((data) => ({
    ...data,
    items: mergeTableOrderItems(data.items),
  }))

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
 * and either:
 *
 * - paid now (default) — status='paid', a payments row records cash/qr_pay; or
 * - pay later — status='pending' with no payment row, settled from the POS
 *   table board / unpaid take-away list (`settle_dine_in_order`).
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
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const {
      items,
      order_type,
      table_id,
      pax,
      payment_timing,
      payment_method,
      customer_name,
      notes,
    } = parsed.data

    const payLater = payment_timing === 'pay_later'

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
      item: (typeof items)[number]
      menuItem: MenuRow
      lineTotalCents: number
    }>

    // Integer-cents arithmetic only.
    const subtotalCents = priced.reduce(
      (sum, line) => sum + line.lineTotalCents,
      0
    )
    const totalCents = subtotalCents

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
    const now = new Date().toISOString()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: null,
        customer_name:
          order_type === 'dine_in'
            ? customer_name || null
            : customer_name || 'Walk-in',
        status: payLater ? 'pending' : 'paid',
        source: 'counter',
        delivery_type: order_type === 'dine_in' ? 'dine_in' : 'self_pickup',
        table_id: order_type === 'dine_in' ? table_id : null,
        table_label: tableLabel,
        pax: order_type === 'dine_in' ? pax : null,
        // The method is only known when the customer pays now; a pay-later
        // order is settled later through the POS (cash/company QR).
        payment_method: payLater ? null : payment_method,
        fulfillment_type: 'asap',
        order_kind: 'standard',
        dispatch_status: 'not_ready',
        subtotal_cents: subtotalCents,
        discount_cents: 0,
        delivery_fee_cents: 0,
        total_cents: totalCents,
        notes: notes ?? null,
        // Dine-in food is served on plates; there is nothing to pack.
        include_cutlery: order_type !== 'dine_in',
      })
      .select('id, order_number, display_code')
      .single()

    if (orderError || !order) {
      console.error('[API/POS] Order insert failed:', orderError)
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
    }

    // Insert one line at a time so each line's id is known for its add-ons.
    for (const line of priced) {
      const { data: insertedItem, error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          menu_item_id: line.menuItem.id,
          menu_item_name: line.menuItem.name,
          menu_item_price_cents: line.menuItem.price_cents,
          quantity: line.item.quantity,
          line_total_cents: line.lineTotalCents,
          notes: line.item.notes ?? null,
        })
        .select('id')
        .single()

      if (itemError || !insertedItem) {
        console.error('[API/POS] Order item insert failed:', itemError)
        await supabase.from('orders').delete().eq('id', order.id)
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
      }

      if (line.item.modifier_ids.length > 0) {
        const { error: modifierError } = await supabase
          .from('order_item_modifiers')
          .insert(
            line.item.modifier_ids.map((modifierId) => {
              const modifier = modifiersById.get(modifierId)!
              return {
                order_item_id: insertedItem.id,
                modifier_id: modifier.id,
                modifier_name: modifier.name,
                modifier_price_delta_cents: modifier.price_delta_cents,
              }
            })
          )
        if (modifierError) {
          console.error('[API/POS] Modifier insert failed:', modifierError)
          await supabase.from('orders').delete().eq('id', order.id)
          return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
        }
      }
    }

    if (!payLater) {
      const { error: paymentError } = await supabase.from('payments').insert({
        order_id: order.id,
        method: payment_method,
        amount_cents: totalCents,
        status: 'succeeded',
        paid_at: now,
      })
      if (paymentError) {
        console.error('[API/POS] Payment insert failed:', paymentError)
        return NextResponse.json(
          {
            error: 'Order created but payment record failed — record the payment manually',
            order_number: order.order_number,
          },
          { status: 500 }
        )
      }
    }

    await supabase.from('order_events').insert({
      order_id: order.id,
      event_type: 'created',
      actor_id: user.id,
      new_value: {
        source: 'counter',
        order_type,
        table_id: order_type === 'dine_in' ? table_id : null,
        table_label: tableLabel,
        pax: order_type === 'dine_in' ? pax : null,
        payment_method: payLater ? null : payment_method,
        payment_timing,
        total_cents: totalCents,
      },
    })

    return NextResponse.json(
      {
        order_id: order.id,
        order_number: order.order_number,
        display_code: order.display_code,
        total_cents: totalCents,
        order_type,
        payment_timing,
        status: payLater ? 'pending' : 'paid',
        table_label: tableLabel,
        pax: order_type === 'dine_in' ? pax : null,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[API/POS] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
