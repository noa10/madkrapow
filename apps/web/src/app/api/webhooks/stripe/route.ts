import { NextRequest, NextResponse } from 'next/server'
import { createStripeClient } from '@/lib/stripe/client'
import { createServerClient } from '@supabase/ssr'
import { finalizePaidOrder } from '@/lib/services/order-payment'

export const runtime = 'nodejs'

/**
 * Stripe Checkout webhook.
 *
 * Payment confirmation and fulfilment live in `finalizePaidOrder` so Stripe and
 * Billplz share the same idempotent paid -> preparing transition.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      console.error('[Webhook] Missing stripe-signature header')
      return NextResponse.json({ success: false, error: 'Missing stripe-signature header' }, { status: 400 })
    }

    // Validate required env vars before attempting verification
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not set')
      return NextResponse.json({ success: false, error: 'Webhook secret not configured' }, { status: 500 })
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[Webhook] Supabase env vars not configured')
      return NextResponse.json({ success: false, error: 'Database not configured' }, { status: 500 })
    }

    let event
    try {
      const stripeClient = createStripeClient()
      event = stripeClient.verifyWebhookSignature(body, signature)
      console.log(`[Webhook] Received event: ${event.type} (${event.id})`)
    } catch (sigError) {
      console.error('[Webhook] Invalid signature:', sigError)
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 })
    }

    if (
      event.type !== 'checkout.session.completed' &&
      event.type !== 'checkout.session.async_payment_succeeded' &&
      event.type !== 'checkout.session.async_payment_failed'
    ) {
      console.log(`[Webhook] Ignoring event type: ${event.type}`)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const session = event.data.object as {
      id: string
      metadata?: Record<string, string>
      payment_intent?: string | { id: string }
      payment_status?: string
    }
    const orderId = session.metadata?.order_id

    if (!orderId) {
      console.error('[Webhook] No order_id in session metadata. Session:', session.id)
      return NextResponse.json({ success: false, error: 'Missing order_id' }, { status: 400 })
    }

    console.log(`[Webhook] Processing ${event.type} for order: ${orderId} (payment_status=${session.payment_status})`)

    // Use service_role key for webhook operations (bypasses RLS)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )

    // Fetch order for the terminal-state guard and the async-failure branch.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('[Webhook] Order not found:', orderId, orderError)
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    // Idempotency: skip if already in a post-preparing or terminal status.
    // 'paid' and 'accepted' are NOT skipped — the webhook must advance them to 'preparing'.
    if (['preparing', 'ready', 'picked_up', 'delivered', 'cancelled'].includes(order.status)) {
      console.log(`[Webhook] Order ${orderId} already in status '${order.status}', skipping`)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Handle async payment failure
    if (event.type === 'checkout.session.async_payment_failed') {
      const { error: cancelError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)

      if (cancelError) {
        console.error('[Webhook] Failed to cancel order after async payment failure:', orderId, cancelError)
        return NextResponse.json({ success: false, error: 'Failed to update order' }, { status: 500 })
      }

      console.log(`[Webhook] Order ${orderId} cancelled due to async payment failure`)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // For checkout.session.completed, only mark as paid if payment_status is actually 'paid'.
    // Async methods (FPX) fire this event before bank confirmation with payment_status='unpaid'.
    // The definitive paid signal for async methods is checkout.session.async_payment_succeeded.
    if (event.type === 'checkout.session.completed' && session.payment_status !== 'paid') {
      console.log(`[Webhook] checkout.session.completed for ${orderId} but payment_status=${session.payment_status}, deferring to async_payment_succeeded`)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Extract Payment Intent ID (not Checkout Session ID)
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as { id: string } | undefined)?.id ?? null

    const result = await finalizePaidOrder(supabase, orderId, {
      paymentPatch: { stripe_payment_intent_id: paymentIntentId },
      logLabel: 'Webhook',
    })

    if (result.outcome === 'failed') {
      console.error('[Webhook] Failed to advance order to preparing:', orderId, result.error)
      return NextResponse.json({ success: false, error: 'Failed to advance order to preparing' }, { status: 500 })
    }

    if (result.outcome === 'not_found') {
      console.error('[Webhook] Order disappeared during finalisation:', orderId)
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
