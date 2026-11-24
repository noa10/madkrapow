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
      amount_total?: number | null
      currency?: string | null
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

    // Session creation and persistence are separate operations. Retry missing or
    // mismatched references so an operator can reconcile any paid session.
    if (!session.id || !order.stripe_session_id || session.id !== order.stripe_session_id) {
      console.error('[Webhook] Session mismatch; reconciliation required:', {
        eventId: event.id, orderId, sessionId: session.id, storedSessionId: order.stripe_session_id,
      })
      return NextResponse.json({ success: false, error: 'Session does not match order' }, { status: 500 })
    }

    if (typeof session.amount_total !== 'number' || session.amount_total !== order.total_cents || session.currency !== 'myr') {
      console.error('[Webhook] Payment amount or currency mismatch; reconciliation required:', {
        eventId: event.id, orderId, sessionId: session.id,
        amount: session.amount_total, expectedAmount: order.total_cents, currency: session.currency,
      })
      return NextResponse.json({ success: false, error: 'Payment does not match order' }, { status: 500 })
    }

    if (order.status === 'cancelled' && session.payment_status === 'paid') {
      console.error('[Webhook] Paid session for cancelled order; reconciliation required:', {
        eventId: event.id, orderId, sessionId: session.id,
      })
      return NextResponse.json({ success: false, error: 'Paid order is cancelled' }, { status: 500 })
    }

    // Idempotency: skip if already in a post-preparing or terminal status.
    // 'paid' and 'accepted' are NOT skipped — the webhook must advance them to 'preparing'.
    if (['preparing', 'ready', 'picked_up', 'delivered', 'cancelled'].includes(order.status)) {
      console.log(`[Webhook] Order ${orderId} already in status '${order.status}', skipping`)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Handle async payment failure
    if (event.type === 'checkout.session.async_payment_failed') {
      if (order.status !== 'pending') {
        console.error('[Webhook] Failed payment for non-pending order; reconciliation required:', {
          eventId: event.id, orderId, sessionId: session.id, status: order.status,
        })
        return NextResponse.json({ success: false, error: 'Order is not pending' }, { status: 500 })
      }

      const { data: cancelledRows, error: cancelError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('status', 'pending')
        .eq('stripe_session_id', session.id)
        .eq('total_cents', session.amount_total)
        .select('id')

      if (cancelError || !cancelledRows?.length) {
        console.error('[Webhook] Failed to cancel order after async payment failure; reconciliation required:', {
          eventId: event.id, orderId, sessionId: session.id, error: cancelError,
        })
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

    if (session.payment_status !== 'paid') {
      console.error('[Webhook] Async success without paid status; reconciliation required:', {
        eventId: event.id, orderId, sessionId: session.id, paymentStatus: session.payment_status,
      })
      return NextResponse.json({ success: false, error: 'Payment not completed' }, { status: 500 })
    }

    // Extract Payment Intent ID (not Checkout Session ID)
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as { id: string } | undefined)?.id ?? null

    const result = await finalizePaidOrder(supabase, orderId, {
      paymentPatch: { stripe_payment_intent_id: paymentIntentId },
      stripePayment: { sessionId: session.id, amountTotal: session.amount_total, currency: 'myr' },
      logLabel: 'Webhook',
    })

    if (result.outcome === 'failed') {
      console.error('[Webhook] Failed to advance order to preparing:', orderId, result.error)
      return NextResponse.json({ success: false, error: 'Failed to advance order to preparing' }, { status: 500 })
    }

    if (result.outcome === 'already_processed' && result.status === 'cancelled') {
      console.error('[Webhook] Paid session for cancelled order; reconciliation required:', {
        eventId: event.id, orderId, sessionId: session.id,
      })
      return NextResponse.json({ success: false, error: 'Paid order is cancelled' }, { status: 500 })
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
