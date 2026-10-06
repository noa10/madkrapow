import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient, GrabFoodApiError } from '@/lib/grabfood/client'

const CancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

/**
 * Cancel a GrabFood order (admin/manager action).
 *
 * Grab's side first (their cancellation rules govern; PUT /partner/v1/order/cancel),
 * then the local atomic transition. If the local step loses a race the order
 * event log flags it for manual reconciliation — Grab is authoritative.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = CancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()
  const { data: channelOrder } = await supabase
    .from('channel_orders')
    .select('id, external_order_id, channel')
    .eq('order_id', id)
    .eq('channel', 'grabfood')
    .maybeSingle()

  if (!channelOrder) {
    return NextResponse.json({ error: 'Not a GrabFood channel order' }, { status: 404 })
  }

  const client = createGrabFoodClient()
  try {
    await client.cancelOrder(channelOrder.external_order_id, parsed.data.reason)
  } catch (err) {
    const message = err instanceof GrabFoodApiError ? err.message : String(err)
    console.error('[GrabFood] cancel failed:', message)
    return NextResponse.json(
      { error: 'GrabFood rejected or failed the cancellation', detail: message },
      { status: err instanceof GrabFoodApiError && err.status === 409 ? 409 : 502 }
    )
  }

  // Grab cancelled — mirror locally (atomic; flag any race).
  const { data: updated } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['pending', 'paid', 'accepted', 'preparing', 'ready'])
    .select('id')

  if (!updated || updated.length === 0) {
    await supabase.from('order_events').insert({
      order_id: id,
      event_type: 'grabfood_cancel_mismatch',
      new_value: { reason: parsed.data.reason, detail: 'Grab cancelled but local order was not in a cancellable state' },
    })
    return NextResponse.json({ ok: true, warning: 'Grab cancelled; local status needs manual review' })
  }

  await supabase.from('order_events').insert({
    order_id: id,
    event_type: 'grabfood_cancelled',
    new_value: { reason: parsed.data.reason },
  })

  return NextResponse.json({ ok: true, status: 'cancelled' })
}
