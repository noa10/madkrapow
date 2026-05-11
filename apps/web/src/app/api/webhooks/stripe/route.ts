import { NextRequest, NextResponse } from 'next/server'
import { createStripeClient } from '@/lib/stripe/client'
import { fulfillDeliveryOrder } from '@/lib/services/order-fulfillment'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'
import { notifyKitchenOfPaidOrder } from '@/lib/bots/notifications'

async function attemptHubboPosPush(supabase: ReturnType<typeof createServerClient>, orderId: string): Promise<void> {
  if (!env.HUBBOPOS_ENABLED) return;

  try {
    const { createHubboPosClient } = await import('@/lib/hubbopos/client');
    const { buildOrderPayload } = await import('@/lib/hubbopos/orders');

    const payload = await buildOrderPayload(orderId);
    if (!payload) return;

    const client = createHubboPosClient();
    const response = await client.createOrder(payload);

    await supabase
      .from('orders')
      .update({
        hubbo_pos_trans_id: payload.trans_id,
        hubbo_pos_invoice_no: payload.invoice_no,
        hubbo_pos_order_id: response.hubbo_order_id || null,
        hubbo_pos_sync_status: 'synced',
        hubbo_pos_last_synced_at: new Date().toISOString(),
        hubbo_pos_last_error: null,
      })
      .eq('id', orderId);

    console.log(`[Webhook] HubboPOS order pushed: ${orderId} -> ${response.hubbo_order_id}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isRetryable = !(error instanceof Error && (error.name === 'HubboPosValidationError' || error.name === 'HubboPosAuthError'));

    await supabase
      .from('orders')
      .update({
        hubbo_pos_sync_status: isRetryable ? 'pending' : 'failed',
        hubbo_pos_last_error: errorMessage,
      })
      .eq('id', orderId);

    if (isRetryable) {
      const { data: order } = await supabase.from('orders').select('order_number').eq('id', orderId).single();
      await supabase.from('hubbopos_sync_queue').insert({
        order_id: orderId,
        action: 'create_order',
        payload: {
          trans_id: `mk-${orderId}`,
          invoice_no: order?.order_number ? `MK-${order.order_number}` : `MK-${orderId.slice(0, 8)}`,
        },
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
      });
    }

    console.error(`[Webhook] HubboPOS push failed for ${orderId}:`, errorMessage);
  }
}

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

    // Fetch order
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

    // Atomic conditional update: only advance if status hasn't changed since we read it.
    // This prevents double-dispatch when webhook and checkout verify race each other.
    const { data: updatedRows, error: updateError } = await supabase
      .from('orders')
      .update({ status: 'preparing', stripe_payment_intent_id: paymentIntentId })
      .eq('id', orderId)
      .eq('status', order.status)
      .select('id')

    if (updateError) {
      console.error('[Webhook] Failed to advance order to preparing:', orderId, updateError)
      return NextResponse.json({ success: false, error: 'Failed to advance order to preparing' }, { status: 500 })
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.log(`[Webhook] Order ${orderId} already advanced by another process, skipping fulfillment`)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    console.log(`[Webhook] Order ${orderId} marked as paid and advanced to preparing`)

    // Bot order notifications (best-effort, never fail webhook)
    if (order.source === 'telegram' || order.source === 'whatsapp') {
      await notifyKitchenOfPaidOrder(orderId)
      try {
        const { sendOrderStatusNotification } = await import('@/lib/bots/order-notifications')
        await sendOrderStatusNotification(orderId, 'preparing')
      } catch {
        // Notification failure must not break the webhook
      }
    }

    // Push to HubboPOS if enabled (best-effort, non-blocking)
    await attemptHubboPosPush(supabase, orderId);

    // Branch by delivery type and fulfillment type for dispatch setup
    const deliveryType = order.delivery_type || 'delivery'
    const fulfillmentType = order.fulfillment_type || 'asap'

    if (deliveryType === 'self_pickup') {
      // Self-pickup: no delivery booking
      await supabase
        .from('orders')
        .update({ dispatch_status: 'not_ready' })
        .eq('id', orderId)

      console.log('[Webhook] Self-pickup dispatch not_ready:', orderId)

    } else if (fulfillmentType === 'scheduled') {
      // Scheduled delivery: queue for later dispatch by cron
      await supabase
        .from('orders')
        .update({ dispatch_status: 'queued' })
        .eq('id', orderId)

      console.log('[Webhook] Scheduled delivery queued:', orderId)

    } else {
      // ASAP delivery: dispatch immediately using fulfillment service
      const result = await fulfillDeliveryOrder(supabase, orderId)
      console.log(`[Webhook] ASAP delivery ${result.success ? 'dispatched' : 'failed'}:`, orderId)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}
