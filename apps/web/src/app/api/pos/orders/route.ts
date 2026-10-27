import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { generateOrderNumber } from '@/lib/orders/order-number'
import { MAX_MERGED_QUANTITY } from '@/lib/pos/table-orders'

const PosOrderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
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
  // Collapse duplicate item rows so price re-validation and totals stay exact.
  .transform((data) => {
    const merged = new Map<string, number>()
    for (const item of data.items) {
      merged.set(item.menu_item_id, (merged.get(item.menu_item_id) ?? 0) + item.quantity)
    }
    return {
      ...data,
      items: [...merged.entries()].map(([menu_item_id, quantity]) => ({
        menu_item_id,
        quantity,
      })),
    }
  })

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

    // Re-validate every item from the database (never trust client prices).
    const menuItemIds = items.map((i) => i.menu_item_id)
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, name, price_cents, is_available')
      .in('id', menuItemIds)

    if (menuError) {
      console.error('[API/POS] Menu fetch failed:', menuError)
      return NextResponse.json({ error: 'Failed to validate menu items' }, { status: 500 })
    }

    const menuById = new Map((menuItems ?? []).map((m) => [m.id, m]))
    const unavailable = items
      .filter((i) => {
        const m = menuById.get(i.menu_item_id)
        return !m || !m.is_available
      })
      .map((i) => menuById.get(i.menu_item_id)?.name ?? i.menu_item_id)
    if (unavailable.length > 0) {
      return NextResponse.json(
        { error: 'Some items are unavailable', items: unavailable },
        { status: 400 }
      )
    }

    // Integer-cents arithmetic only.
    const subtotalCents = items.reduce(
      (sum, i) => sum + (menuById.get(i.menu_item_id)?.price_cents ?? 0) * i.quantity,
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

    const { error: itemsError } = await supabase.from('order_items').insert(
      items.map((i) => {
        const menuItem = menuById.get(i.menu_item_id)!
        return {
          order_id: order.id,
          menu_item_id: menuItem.id,
          menu_item_name: menuItem.name,
          menu_item_price_cents: menuItem.price_cents,
          quantity: i.quantity,
          line_total_cents: menuItem.price_cents * i.quantity,
        }
      })
    )
    if (itemsError) {
      console.error('[API/POS] Order items insert failed:', itemsError)
      return NextResponse.json(
        { error: 'Order created but items failed to record', order_number: order.order_number },
        { status: 500 }
      )
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
