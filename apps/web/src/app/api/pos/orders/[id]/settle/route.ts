import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'

const SettleSchema = z.object({
  payment_method: z.enum(['cash', 'qr_pay']),
})

const ORDER_ID = z.string().uuid()

/**
 * Collect payment for an unpaid POS order.
 *
 * Covers table-QR dine-in orders (pay at the counter) and POS pay-later
 * counter orders (dine-in or take-away). This route records the cash/QR Pay
 * payment and moves the order to `paid` in one transaction
 * (`settle_dine_in_order`), so a double-tap cannot record two payments. The
 * kitchen already sees the pending ticket.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!ORDER_ID.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
    }

    const auth = await requireRole(req, ['admin', 'manager', 'cashier'])
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = SettleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('settle_dine_in_order', {
      p_order_id: id,
      p_method: parsed.data.payment_method,
      p_actor_id: user.id,
    })

    if (error) {
      console.error('[API/POS] Settle RPC failed:', error)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    const result = data as {
      ok?: boolean
      code?: string
      status?: string
      amount_cents?: number
    } | null

    if (result?.ok) {
      return NextResponse.json({
        success: true,
        status: result.status,
        amount_cents: result.amount_cents,
      })
    }

    switch (result?.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      case 'not_settleable':
      case 'not_dine_in':
        return NextResponse.json(
          { error: 'Only POS counter or dine-in orders can be settled here' },
          { status: 400 }
        )
      case 'already_paid':
        return NextResponse.json(
          { error: 'This order is already paid' },
          { status: 409 }
        )
      case 'not_pending':
        return NextResponse.json(
          {
            error: 'Only unpaid orders can be settled',
            status: result.status ?? null,
          },
          { status: 409 }
        )
      case 'invalid_method':
        return NextResponse.json({ error: 'Unsupported payment method' }, { status: 400 })
      default:
        return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }
  } catch (err) {
    console.error('[API/POS] Unexpected settle error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
