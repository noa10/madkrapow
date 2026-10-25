import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'
import { STRIPE_API_VERSION } from '@/lib/stripe/api-version'
import {
  getBill,
  getBillplzCollectionId,
  isBillplzConfigured,
} from '@/lib/billplz/client'
import { recordBillplzPayment } from '@/lib/billplz/payments'
import { finalizePaidOrder } from '@/lib/services/order-payment'
import { sanitizeForLog } from '@/lib/logging/safe-log'

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
type ServiceClient = ReturnType<typeof createServerClient>

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Success-page fallback when the webhook is delayed or missed.
 *
 * The caller supplies the provider reference it was redirected with (Stripe
 * `session_id` or Billplz `billId`). This route re-reads the payment from the
 * gateway and then hands off to the same finalisation path as the webhooks.
 */
export async function POST(req: NextRequest): Promise<NextResponse<VerifyResult>> {
  try {
    const body = await req.json()
    const orderId = body.orderId as string | undefined
    const sessionId = body.sessionId as string | undefined
    const billId = body.billId as string | undefined

    if (!orderId || (!sessionId && !billId)) {
      return NextResponse.json(
        { success: false, error: 'Missing orderId and payment reference' },
        { status: 400 }
      )
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[Verify] Supabase env vars not configured')
      return NextResponse.json(
        { success: false, error: 'Database not configured' },
        { status: 500 }
      )
    }

    // Use service_role key for verification operations (bypasses RLS)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )

    if (billId) {
      return verifyBillplzPayment(supabase, orderId, billId)
    }

    return verifyStripePayment(supabase, orderId, sessionId!)
  } catch (error) {
    console.error('[Verify] Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

async function verifyBillplzPayment(
  supabase: ServiceClient,
  orderId: string,
  billId: string,
): Promise<NextResponse<VerifyResult>> {
  if (!isBillplzConfigured()) {
    console.error('[Verify] Billplz is not configured')
    return NextResponse.json(
      { success: false, error: 'Payment service not configured' },
      { status: 500 }
    )
  }

  let bill
  try {
    // The redirect query string is user-controlled; only the Billplz API can
    // tell us whether the bill is actually paid.
    bill = await getBill(billId)
  } catch (billError) {
    console.error(
      '[Verify] Billplz bill retrieve failed:',
      sanitizeForLog(billId),
      billError instanceof Error ? billError.message : 'Unknown error'
    )
    return NextResponse.json(
      { success: false, error: 'Unable to verify payment with Billplz' },
      { status: 500 }
    )
  }

  const expectedCollectionId = getBillplzCollectionId()
  if (
    expectedCollectionId &&
    bill.collection_id &&
    bill.collection_id !== expectedCollectionId
  ) {
    return NextResponse.json(
      { success: false, error: 'Bill belongs to a different collection' },
      { status: 400 }
    )
  }

  // Security: ensure the bill belongs to the requested order.
  if (bill.reference_1 !== orderId) {
    console.error(
      '[Verify] Bill reference mismatch:',
      sanitizeForLog(String(bill.reference_1 ?? '')),
      '!=',
      sanitizeForLog(orderId)
    )
    return NextResponse.json(
      { success: false, error: 'Bill does not match order' },
      { status: 400 }
    )
  }

  const isPaid = bill.paid === true || String(bill.paid) === 'true'
  if (!isPaid) {
    return NextResponse.json(
      { success: false, error: 'Payment not completed' },
      { status: 400 }
    )
  }

  const paidAmountCents = Number(bill.paid_amount ?? bill.amount)
  if (!Number.isInteger(paidAmountCents) || paidAmountCents <= 0) {
    return NextResponse.json(
      { success: false, error: 'Invalid paid amount' },
      { status: 400 }
    )
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    console.error('[Verify] Order not found:', sanitizeForLog(orderId), orderError)
    return NextResponse.json(
      { success: false, error: 'Order not found' },
      { status: 404 }
    )
  }

  if (order.billplz_bill_id && order.billplz_bill_id !== billId) {
    return NextResponse.json(
      { success: false, error: 'Bill does not match order' },
      { status: 400 }
    )
  }

  if (paidAmountCents !== order.total_cents) {
    console.error(
      `[Verify] Amount mismatch for order ${sanitizeForLog(orderId)}: paid=${paidAmountCents} expected=${order.total_cents}`
    )
    return NextResponse.json(
      { success: false, error: 'Paid amount does not match order total' },
      { status: 400 }
    )
  }

  await recordBillplzPayment(supabase, orderId, bill, paidAmountCents)

  const result = await finalizePaidOrder(supabase, orderId, {
    paymentPatch: { billplz_bill_id: billId },
    logLabel: 'Verify',
  })

  if (result.outcome === 'failed') {
    console.error('[Verify] Failed to advance Billplz order:', sanitizeForLog(orderId), result.error)
    return NextResponse.json(
      { success: false, error: 'Failed to advance order to preparing' },
      { status: 500 }
    )
  }

  if (result.outcome === 'not_found') {
    return NextResponse.json(
      { success: false, error: 'Order not found' },
      { status: 404 }
    )
  }

  if (result.outcome === 'already_processed') {
    return NextResponse.json(
      { success: true, status: result.status, message: 'Order already processed' },
      { status: 200 }
    )
  }

  return NextResponse.json(
    { success: true, status: 'preparing', message: 'Payment confirmed and order updated' },
    { status: 200 }
  )
}

async function verifyStripePayment(
  supabase: ServiceClient,
  orderId: string,
  sessionId: string,
): Promise<NextResponse<VerifyResult>> {
  const stripeSecretKey = env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    console.error('[Verify] STRIPE_SECRET_KEY not configured')
    return NextResponse.json(
      { success: false, error: 'Payment service not configured' },
      { status: 500 }
    )
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
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
    console.error(
      '[Verify] Session metadata order_id mismatch:',
      sanitizeForLog(session.metadata?.order_id ?? ''),
      '!=',
      sanitizeForLog(orderId)
    )
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

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null

  const result = await finalizePaidOrder(supabase, orderId, {
    paymentPatch: {
      stripe_payment_intent_id: paymentIntentId,
      stripe_session_id: session.id,
    },
    logLabel: 'Verify',
  })

  if (result.outcome === 'failed') {
    console.error('[Verify] Failed to advance order to preparing:', orderId, result.error)
    return NextResponse.json(
      { success: false, error: 'Failed to advance order to preparing' },
      { status: 500 }
    )
  }

  if (result.outcome === 'not_found') {
    return NextResponse.json(
      { success: false, error: 'Order not found' },
      { status: 404 }
    )
  }

  if (result.outcome === 'already_processed') {
    return NextResponse.json(
      { success: true, status: result.status, message: 'Order already processed' },
      { status: 200 }
    )
  }

  return NextResponse.json(
    { success: true, status: 'preparing', message: 'Payment confirmed and order updated' },
    { status: 200 }
  )
}
