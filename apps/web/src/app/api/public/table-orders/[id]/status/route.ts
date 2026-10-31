/**
 * POST /api/public/table-orders/[id]/status
 *
 * The read path for a table order. The diner's phone used to believe its own
 * `sessionStorage` snapshot: a claim whose response was lost (the phone
 * switched to the banking app) left the screen showing "pending" with a live
 * "Pay now by QR" button on an order that was already paid — and a second
 * transfer is real money out of the diner's pocket.
 *
 * The trust model is the claim's: the table token proves the caller is at the
 * table, the order's idempotency key proves they created this order. A diner
 * at the same table cannot read (or claim) someone else's round.
 *
 * Read-only: this route never writes, so it is safe to call on every resume.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase/server'
import { sanitizeForLog } from '@/lib/logging/safe-log'
import { createSlidingWindowLimiter } from '@/lib/pos/rate-limit'

export const runtime = 'nodejs'

const StatusSchema = z.object({
  table_token: z.string().trim().min(16).max(128),
  idempotency_key: z.string().trim().min(16).max(128),
})

/**
 * Read attempts per table per minute.
 *
 * Every diner's phone polls while the payment screen is open (~4/min), so a
 * large table of 15 phones needs ~60/min; 240 leaves 4x headroom while still
 * capping a flood from one token.
 */
const READ_LIMIT = 240
const READ_WINDOW_MS = 60 * 1000

const readLimiter = createSlidingWindowLimiter(READ_LIMIT, READ_WINDOW_MS)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = StatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Seeded ids are UUID-shaped but not RFC 4122 v4; `z.guid()` accepts any
  // 8-4-4-4-12 hex shape and the database still enforces membership.
  if (!z.guid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
  }

  const input = parsed.data

  // Keyed by the token, so a flood is rejected before it reaches the database.
  if (!readLimiter.allow(input.table_token)) {
    return NextResponse.json(
      { error: 'Too many checks. Please wait a moment and try again.' },
      { status: 429 }
    )
  }

  const supabase = getServiceClient()

  // Token → active table, exactly like the create and claim routes.
  const { data: table, error: tableError } = await supabase
    .from('restaurant_tables')
    .select('id, is_active')
    .eq('qr_token', input.table_token)
    .maybeSingle()

  if (tableError) {
    console.error('[API/TableOrderStatus] Table lookup failed:', tableError)
    return NextResponse.json({ error: 'Unable to check the order' }, { status: 500 })
  }
  if (!table || !table.is_active) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // The idempotency key is the membership check: it proves this caller
  // created this order. A wrong key must look exactly like a missing order.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, total_cents, payment_method')
    .eq('id', id)
    .eq('table_id', table.id)
    .eq('idempotency_key', input.idempotency_key)
    .maybeSingle()

  if (orderError) {
    console.error(
      '[API/TableOrderStatus] Order lookup failed:',
      sanitizeForLog(orderError.message)
    )
    return NextResponse.json({ error: 'Unable to check the order' }, { status: 500 })
  }
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // The ledger is the authority on money: a succeeded payment row proves it
  // moved even when `orders.status` has not caught up yet.
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('method, status, paid_at')
    .eq('order_id', id)
    .eq('status', 'succeeded')
    .limit(1)
    .maybeSingle()

  if (paymentError) {
    console.error(
      '[API/TableOrderStatus] Payment lookup failed:',
      sanitizeForLog(paymentError.message)
    )
    return NextResponse.json({ error: 'Unable to check the order' }, { status: 500 })
  }

  const status = (order.status ?? 'pending') as string
  return NextResponse.json(
    {
      order_id: order.id,
      status,
      total_cents: order.total_cents ?? 0,
      payment_method:
        (payment?.method as string | null | undefined) ??
        (order.payment_method as string | null | undefined) ??
        null,
      paid_at: (payment?.paid_at as string | null | undefined) ?? null,
      payment_recorded: Boolean(payment),
    },
    { status: 200 }
  )
}
