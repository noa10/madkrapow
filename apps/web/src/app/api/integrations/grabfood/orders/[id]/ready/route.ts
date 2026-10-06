import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient, GrabFoodApiError } from '@/lib/grabfood/client'

/**
 * Mark a GrabFood order ready (staff action, e.g. kitchen "Ready" button).
 *
 * Local state first (atomic preparing->ready), then the Grab API
 * (POST /partner/v1/orders/mark). A Grab-side failure is recorded on the order
 * and surfaced in the response — the local status stays correct and the action
 * can be retried.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'manager', 'cashier', 'kitchen'])
  if ('error' in auth) return auth.error

  const { id } = await params
  const supabase = getServiceClient()

  const { data: channelOrder } = await supabase
    .from('channel_orders')
    .select('id, external_order_id, external_order_number, channel')
    .eq('order_id', id)
    .eq('channel', 'grabfood')
    .maybeSingle()

  if (!channelOrder) {
    return NextResponse.json({ error: 'Not a GrabFood channel order' }, { status: 404 })
  }

  // Atomic local transition (idempotent when already ready).
  const { data: updated } = await supabase
    .from('orders')
    .update({ status: 'ready' })
    .eq('id', id)
    .eq('status', 'preparing')
    .select('id')

  if (!updated || updated.length === 0) {
    const { data: current } = await supabase
      .from('orders')
      .select('status')
      .eq('id', id)
      .single()
    if (current?.status !== 'ready') {
      return NextResponse.json(
        { error: `Cannot mark ready from status '${current?.status}'` },
        { status: 409 }
      )
    }
  }

  const client = createGrabFoodClient()
  try {
    await client.markOrderReady(channelOrder.external_order_id)
  } catch (err) {
    const message = err instanceof GrabFoodApiError ? err.message : String(err)
    console.error('[GrabFood] mark-ready failed:', message)
    await supabase.from('order_events').insert({
      order_id: id,
      event_type: 'grabfood_ready_failed',
      new_value: { error: message },
    })
    return NextResponse.json(
      {
        warning: 'Order marked ready locally, but GrabFood could not be notified — retry',
        detail: message,
      },
      { status: 200 }
    )
  }

  return NextResponse.json({ ok: true, status: 'ready' })
}
