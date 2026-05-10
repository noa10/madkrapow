import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'
import { fulfillDeliveryOrder } from '@/lib/services/order-fulfillment'

function sanitizeForLog(value: string): string {
  return value.replace(/\n|\r/g, '')
}

interface VerifyResponse {
  success: true
  status: string
  message: string
}

interface VerifyError {
  success: false
  error: string
}

type VerifyResult = VerifyResponse | VerifyError

export async function POST(req: NextRequest): Promise<NextResponse<VerifyResult>> {
  try {
    const body = await req.json()
    const orderId = body.orderId as string | undefined
    const sessionId = body.sessionId as string | undefined

    if (!orderId || !sessionId) {
      return NextResponse.json(
        { success: false, error: 'Missing orderId or sessionId' },
        { status: 400 }
      )
    }

    if (!env.STRIPE_SECRET_KEY) {
      console.error('[Verify] STRIPE_SECRET_KEY not configured')
      return NextResponse.json(
        { success: false, error: 'Payment service not configured' },
        { status: 500 }
      )
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[Verify] Supabase env vars not configured')
      return NextResponse.json(
        { success: false, error: 'Database not configured' },
        { status: 500 }
      )
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia' as const,
    })

    // Verify the checkout session with Stripe
    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId)
    } catch (stripeError) {
      console.error('[Verify] Stripe session retrieve failed:', stripeError)
      return NextResponse.json(
        { success: false, error: 'Unable to verify payment with Stripe' },
        { status: 500 }
      )
    }

    // Security: ensure the session belongs to the requested order
    if (session.metadata?.order_id !== orderId) {
      console.error('[Verify] Session metadata order_id mismatch:', session.metadata?.order_id, '!=', orderId)
      return NextResponse.json(
        { success: false, error: 'Session does not match order' },
        { status: 400 }
      )
    }

    // For async methods (FPX, bank transfers) payment_status may be 'unpaid' at redirect time.
    // Check the PaymentIntent to distinguish between processing and truly failed payments.
    if (session.payment_status !== 'paid') {
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

      if (paymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
          if (paymentIntent.status === 'processing' || paymentIntent.status === 'requires_action') {
            return NextResponse.json(
              { success: true, status: 'processing', message: 'Payment is being processed by the bank. Please wait.' },
              { status: 200 }
            )
          }
          if (['requires_payment_method', 'canceled'].includes(paymentIntent.status)) {
            return NextResponse.json(
              { success: false, error: 'Payment failed or was canceled' },
              { status: 400 }
            )
          }
        } catch (piError) {
          console.error('[Verify] Failed to retrieve payment intent:', sanitizeForLog(paymentIntentId), piError)
        }
      }

      return NextResponse.json(
        { success: false, error: 'Payment not completed' },
        { status: 400 }
      )
    }

    // Use service_role key for verification operations (bypasses RLS)
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
      console.error('[Verify] Order not found:', orderId, orderError)
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    // Idempotency: skip if already in post-preparing or terminal status.
    // 'paid' and 'accepted' are NOT skipped — we must advance them to 'preparing'.
    if (['preparing', 'ready', 'picked_up', 'delivered', 'cancelled'].includes(order.status)) {
      return NextResponse.json(
        { success: true, status: order.status, message: 'Order already processed' },
        { status: 200 }
      )
    }

    // Atomic conditional update: only advance if status hasn't changed since we read it.
    // This prevents double-dispatch when webhook and checkout verify race each other.
    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

    const { data: updatedRows, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'preparing',
        stripe_payment_intent_id: paymentIntentId,
        stripe_session_id: session.id,
      })
      .eq('id', orderId)
      .eq('status', order.status)
      .select('id')

    if (updateError) {
      console.error('[Verify] Failed to advance order to preparing:', orderId, updateError)
      return NextResponse.json(
        { success: false, error: 'Failed to advance order to preparing' },
        { status: 500 }
      )
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.log(`[Verify] Order ${orderId} already advanced by another process, skipping fulfillment`)
      return NextResponse.json(
        { success: true, status: 'preparing', message: 'Order already processed' },
        { status: 200 }
      )
    }

    console.log(`[Verify] Order ${orderId} marked as paid and advanced to preparing`)

    // Branch by delivery type and fulfillment type for dispatch setup
    const deliveryType = order.delivery_type || 'delivery'
    const fulfillmentType = order.fulfillment_type || 'asap'

    if (deliveryType === 'self_pickup') {
      await supabase
        .from('orders')
        .update({ dispatch_status: 'not_ready' })
        .eq('id', orderId)

      console.log('[Verify] Self-pickup dispatch not_ready:', orderId)
    } else if (fulfillmentType === 'scheduled') {
      await supabase
        .from('orders')
        .update({ dispatch_status: 'queued' })
        .eq('id', orderId)

      console.log('[Verify] Scheduled delivery queued:', orderId)
    } else {
      const result = await fulfillDeliveryOrder(supabase, orderId)
      console.log(`[Verify] ASAP delivery ${result.success ? 'dispatched' : 'failed'}:`, orderId)
    }

    return NextResponse.json(
      { success: true, status: 'preparing', message: 'Payment confirmed and order updated' },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Verify] Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
