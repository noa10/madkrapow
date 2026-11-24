import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { env } from '@/lib/validators/env'
import { STRIPE_API_VERSION } from '@/lib/stripe/api-version'
import { getStripeConfigIssue } from '@/lib/stripe/config'
import { requireAdmin } from '@/lib/admin/require-admin'

const ApproveRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    approved_total_cents: z.number().int().min(0),
    review_notes: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal('reject'),
    review_notes: z.string().nullable().optional(),
  }),
])

interface ApproveResponse {
  success: true
  checkoutUrl?: string
  message: string
}

interface ApproveError {
  success: false
  error: string
}

type ApproveResult = ApproveResponse | ApproveError

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApproveResult>> {
  try {
    const guard = await requireAdmin(req)
    if ('error' in guard) return guard.error as NextResponse<ApproveResult>

    if (getStripeConfigIssue()) {
      return NextResponse.json({ success: false, error: 'Card payment is not available right now.' }, { status: 503 })
    }

    const { id: orderId } = await params
    const { data: order, error } = await guard.supabase
      .from('orders')
      .select('order_kind, status, approval_status, stripe_session_id, total_cents, approved_total_cents')
      .eq('id', orderId)
      .single()

    if (error || !order || order.order_kind !== 'bulk' || order.status !== 'pending' ||
      order.approval_status !== 'approved' || !order.stripe_session_id ||
      !Number.isSafeInteger(order.total_cents) || order.total_cents <= 0 ||
      order.approved_total_cents !== order.total_cents) {
      return NextResponse.json({ success: false, error: 'Payment link is unavailable' }, { status: 409 })
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION })
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id)
    if (session.id !== order.stripe_session_id || session.mode !== 'payment' || session.status !== 'open' ||
      session.payment_status !== 'unpaid' || session.currency !== 'myr' ||
      session.amount_total !== order.total_cents || session.metadata?.order_id !== orderId || !session.url) {
      return NextResponse.json({ success: false, error: 'Payment link is unavailable' }, { status: 409 })
    }

    // Check the order again after Stripe's network request before disclosing the URL.
    const { data: current, error: readError } = await guard.supabase
      .from('orders')
      .select('order_kind, status, approval_status, stripe_session_id, total_cents, approved_total_cents')
      .eq('id', orderId)
      .single()
    if (readError || !current || current.order_kind !== 'bulk' || current.status !== 'pending' ||
      current.approval_status !== 'approved' || current.stripe_session_id !== session.id ||
      current.total_cents !== session.amount_total || current.approved_total_cents !== session.amount_total) {
      return NextResponse.json({ success: false, error: 'Payment link is unavailable' }, { status: 409 })
    }

    return NextResponse.json(
      { success: true, checkoutUrl: session.url, message: 'Payment link ready.' },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('[API] Failed to retrieve bulk checkout session:', error)
    return NextResponse.json({ success: false, error: 'Unable to retrieve payment link' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApproveResult>> {
  try {
    const stripeIssue = getStripeConfigIssue()
    if (stripeIssue) {
      console.warn('[API] Bulk approval blocked; Stripe unavailable:', stripeIssue)
      return NextResponse.json(
        { success: false, error: 'Card payment is not available right now.' },
        { status: 503 }
      )
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
      apiVersion: STRIPE_API_VERSION,
    })

    const guard = await requireAdmin(req)
    if ("error" in guard) {
      return guard.error as NextResponse<ApproveResult>
    }

    const { user, supabase: db } = guard

    const { id: orderId } = await params
    const rawBody = await req.text()

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const parsed = ApproveRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      )
    }

    const { action, review_notes } = parsed.data

    // Fetch the order
    const { data: order, error: fetchError } = await db
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    if (order.order_kind !== 'bulk') {
      return NextResponse.json(
        { success: false, error: 'This is not a bulk order' },
        { status: 400 }
      )
    }

    if (order.approval_status !== 'pending_review') {
      return NextResponse.json(
        { success: false, error: 'Order has already been reviewed' },
        { status: 400 }
      )
    }

    if (order.status !== 'pending' || order.stripe_session_id) {
      return NextResponse.json(
        { success: false, error: 'Order payment needs reconciliation before review' },
        { status: 409 }
      )
    }

    if (action === 'reject') {
      const { data: rejected, error: rejectError } = await db
        .from('orders')
        .update({
          approval_status: 'rejected',
          status: 'cancelled',
          review_notes: review_notes || 'Order rejected',
        })
        .eq('id', orderId)
        .eq('status', 'pending')
        .eq('approval_status', 'pending_review')
        .is('stripe_session_id', null)
        .select('id')

      if (rejectError) {
        console.error('[API] Failed to reject bulk order:', rejectError)
        return NextResponse.json({ success: false, error: 'Unable to reject order' }, { status: 500 })
      }
      if (!rejected?.length) {
        return NextResponse.json({ success: false, error: 'Order changed during review' }, { status: 409 })
      }

      await db.from('order_events').insert({
        order_id: orderId,
        event_type: 'bulk_rejected',
        new_value: { reason: review_notes || 'Order rejected' },
      })

      // Notify bot customers of cancellation (best-effort, non-blocking)
      try {
        const { sendOrderStatusNotification } = await import('@/lib/bots/order-notifications')
        await sendOrderStatusNotification(orderId, 'cancelled')
      } catch {
        // Notification failure must not break the order update
      }

      return NextResponse.json({
        success: true,
        message: 'Order rejected',
      })
    }

    // Approve: create Stripe checkout session
    if (parsed.data.action !== 'approve') {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      )
    }

    const { approved_total_cents } = parsed.data

    if (!approved_total_cents) {
      return NextResponse.json(
        { success: false, error: 'Approved total is required' },
        { status: 400 }
      )
    }

    // Create a single line item for the approved total
    // (since admin may have adjusted pricing)
    const lineItems: NonNullable<Parameters<typeof stripe.checkout.sessions.create>[0]>['line_items'] = [
      {
        price_data: {
          currency: 'myr',
          product_data: {
            name: `Bulk Order: ${order.bulk_company_name || 'Event Order'}`,
            description: `${order.bulk_headcount || 'N/A'} pax - ${format(new Date(order.bulk_requested_date || order.created_at), "MMM d, yyyy")}`,
          },
          unit_amount: approved_total_cents,
        },
        quantity: 1,
      },
    ]

    const session = await stripe.checkout.sessions.create({
      allowed_payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${env.NEXT_PUBLIC_URL}/order/success?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.NEXT_PUBLIC_URL}/order/${orderId}`,
      metadata: {
        order_id: orderId,
        customer_id: order.customer_id,
        is_bulk_approval: 'true',
      },
    })

    if (!session.url) {
      return NextResponse.json({ success: false, error: 'Unable to create checkout session' }, { status: 502 })
    }

    // Publish the session and its amount together only while the order remains unreviewed and unpaid.
    const { data: approved, error: approveError } = await db
      .from('orders')
      .update({
        approval_status: 'approved',
        approved_total_cents,
        review_notes: review_notes || null,
        total_cents: approved_total_cents,
        stripe_session_id: session.id,
      })
      .eq('id', orderId)
      .eq('status', 'pending')
      .eq('approval_status', 'pending_review')
      .is('stripe_session_id', null)
      .select('id')

    if (approveError || !approved?.length) {
      const { data: current, error: readError } = await db
        .from('orders')
        .select('status, approval_status, stripe_session_id, total_cents, approved_total_cents')
        .eq('id', orderId)
        .single()

      if (approveError) {
        if (readError || current?.status !== 'pending' || current?.approval_status !== 'approved' ||
          current?.stripe_session_id !== session.id || current?.total_cents !== approved_total_cents ||
          current?.approved_total_cents !== approved_total_cents) {
          console.error('[API] Failed to approve bulk order:', approveError)
          return NextResponse.json({ success: false, error: 'Unable to approve order' }, { status: 500 })
        }
      } else {
        // A zero-row update is definitive; never expire a session the order may reference.
        if (!readError && current && current.stripe_session_id !== session.id) {
          try {
            await stripe.checkout.sessions.expire(session.id)
          } catch (error) {
            console.error('[API] Failed to expire unused bulk checkout session:', error)
          }
        }
        return NextResponse.json({ success: false, error: 'Order changed during review' }, { status: 409 })
      }
    }

    await db.from('order_events').insert({
      order_id: orderId,
      event_type: 'bulk_approved',
      new_value: {
        approved_total_cents,
        review_notes,
        stripe_session_id: session.id,
      },
    })

    return NextResponse.json({
      success: true,
      checkoutUrl: session.url || undefined,
      message: 'Order approved. Payment link ready.',
    })
  } catch (error) {
    console.error('[API] /api/admin/orders/[id]/approve:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

// Helper: format date (inline since this is a server route)
function format(date: Date, pattern: string): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const d = date.getDate()
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  const h = date.getHours()
  const m = date.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h

  return pattern
    .replace('MMMM', months[date.getMonth()])
    .replace('MMM', month)
    .replace('d', d.toString())
    .replace('yyyy', year.toString())
    .replace("'at'", 'at')
    .replace('h:mm a', `${h12}:${m.toString().padStart(2, '0')} ${ampm}`)
}
