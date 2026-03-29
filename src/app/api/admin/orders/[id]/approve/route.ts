import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { env } from '@/lib/validators/env'
import { getServerClient } from '@/lib/supabase/server'

const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia' as const,
})

const ApproveRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
  approved_total_cents: z.number().int().min(0).optional(),
  review_notes: z.string().optional(),
})

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApproveResult>> {
  try {
    const supabase = await getServerClient()

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // TODO: Verify admin role (for now, any authenticated user can approve)
    // In production, check user role or admin table

    const { id: orderId } = await params
    const body = await req.json()
    const parsed = ApproveRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      )
    }

    const { action, approved_total_cents, review_notes } = parsed.data

    // Fetch the order
    const { data: order, error: fetchError } = await supabase
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

    if (action === 'reject') {
      // Reject: cancel the order
      await supabase
        .from('orders')
        .update({
          approval_status: 'rejected',
          status: 'cancelled',
          review_notes: review_notes || 'Order rejected',
        })
        .eq('id', orderId)

      await supabase.from('order_events').insert({
        order_id: orderId,
        event_type: 'bulk_rejected',
        new_value: { reason: review_notes || 'Order rejected' },
      })

      return NextResponse.json({
        success: true,
        message: 'Order rejected',
      })
    }

    // Approve: create Stripe checkout session
    if (!approved_total_cents) {
      return NextResponse.json(
        { success: false, error: 'Approved total is required' },
        { status: 400 }
      )
    }

    // Update order with approved status
    await supabase
      .from('orders')
      .update({
        approval_status: 'approved',
        approved_total_cents,
        review_notes: review_notes || null,
        total_cents: approved_total_cents,
      })
      .eq('id', orderId)

    // Create a single line item for the approved total
    // (since admin may have adjusted pricing)
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
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
      payment_method_types: ['card'],
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

    // Store the session ID
    await supabase
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', orderId)

    await supabase.from('order_events').insert({
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
