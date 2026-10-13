import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'

const PosOrderItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
})

const PosOrderSchema = z
  .object({
    items: z.array(PosOrderItemSchema).min(1).max(50),
    payment_method: z.enum(['cash', 'qr_pay']),
    customer_name: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
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

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `MK${timestamp}${random}`
}

/**
 * Counter POS order creation.
 *
 * Prices are NEVER taken from the client: the route re-reads menu_items from the
 * database and recomputes the total. Orders are created as source='counter',
 * status='paid' (the customer pays at the counter — no Stripe session), and a
 * payments row records the money movement (cash or QR Pay).
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
    const { items, payment_method, customer_name, notes } = parsed.data

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

    const orderNumber = generateOrderNumber()
    const now = new Date().toISOString()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: null,
        customer_name: customer_name || 'Walk-in',
        status: 'paid',
        source: 'counter',
        delivery_type: 'self_pickup',
        fulfillment_type: 'asap',
        order_kind: 'standard',
        dispatch_status: 'not_ready',
        subtotal_cents: subtotalCents,
        discount_cents: 0,
        delivery_fee_cents: 0,
        total_cents: totalCents,
        notes: notes ?? null,
        include_cutlery: true,
      })
      .select('id, order_number')
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

    await supabase.from('order_events').insert({
      order_id: order.id,
      event_type: 'created',
      actor_id: user.id,
      new_value: { source: 'counter', payment_method, total_cents: totalCents },
    })

    return NextResponse.json(
      {
        order_id: order.id,
        order_number: order.order_number,
        total_cents: totalCents,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[API/POS] Unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
