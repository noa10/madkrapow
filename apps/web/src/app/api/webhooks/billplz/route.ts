import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  getBill,
  getBillplzCollectionId,
  isBillplzConfigured,
  verifyBillplzSignature,
} from '@/lib/billplz/client'
import { recordBillplzPayment } from '@/lib/billplz/payments'
import { finalizePaidOrder } from '@/lib/services/order-payment'
import { sanitizeForLog } from '@/lib/logging/safe-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface OrderRow {
  id: string
  status: string
  total_cents: number
  billplz_bill_id: string | null
}

function parseAmount(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) ? parsed : null
}

/**
 * Billplz X Signature callbacks.
 *
 * The callback body is only a notification: every decision here is based on a
 * fresh `GET /bills/{id}`. That keeps a forged or replayed body from advancing
 * an order, and it lets a callback that arrives after the customer already
 * returned to the site still finalise correctly.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isBillplzConfigured()) {
      console.error('[Billplz Webhook] Billplz is not configured')
      return NextResponse.json(
        { success: false, error: 'Billplz is not configured' },
        { status: 500 },
      )
    }

    const rawBody = await req.text()
    const params: Record<string, string> = {}
    for (const [key, value] of new URLSearchParams(rawBody)) {
      params[key] = value
    }

    const providedSignature =
      params.x_signature ?? req.headers.get('x-signature')

    if (!verifyBillplzSignature(params, providedSignature)) {
      console.error('[Billplz Webhook] Invalid X Signature')
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 },
      )
    }

    const billId = params.id
    if (!billId) {
      console.error('[Billplz Webhook] Missing bill id')
      return NextResponse.json(
        { success: false, error: 'Missing bill id' },
        { status: 400 },
      )
    }

    const bill = await getBill(billId)

    // A bill from another collection is not ours, even if the signature and
    // amount look right.
    const expectedCollectionId = getBillplzCollectionId()
    if (
      expectedCollectionId &&
      bill.collection_id &&
      bill.collection_id !== expectedCollectionId
    ) {
      console.error(
        `[Billplz Webhook] Bill ${sanitizeForLog(billId)} belongs to collection ${sanitizeForLog(bill.collection_id)}`,
      )
      return NextResponse.json(
        { success: false, error: 'Bill belongs to a different collection' },
        { status: 400 },
      )
    }

    const isPaid = bill.paid === true || String(bill.paid) === 'true'

    if (!isPaid) {
      // A failed FPX attempt leaves the bill in `due`; the customer can retry
      // the same bill, so the order stays pending rather than being cancelled.
      console.log(
        `[Billplz Webhook] Bill ${sanitizeForLog(billId)} is not paid (state=${sanitizeForLog(bill.state ?? 'unknown')})`,
      )
      return NextResponse.json({ success: true, received: true }, { status: 200 })
    }

    const paidAmountCents = parseAmount(bill.paid_amount ?? bill.amount)
    if (paidAmountCents === null || paidAmountCents <= 0) {
      console.error(
        `[Billplz Webhook] Bill ${sanitizeForLog(billId)} has an invalid paid amount`,
      )
      return NextResponse.json(
        { success: false, error: 'Invalid paid amount' },
        { status: 400 },
      )
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.error('[Billplz Webhook] Supabase env vars not configured')
      return NextResponse.json(
        { success: false, error: 'Database not configured' },
        { status: 500 },
      )
    }

    // Service role bypasses RLS; payment webhooks are authenticated by the
    // Billplz signature above and must be able to write orders/payments.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { cookies: { getAll() { return [] }, setAll() {} } },
    )

    const referenceOrderId =
      typeof bill.reference_1 === 'string' && bill.reference_1.length > 0
        ? bill.reference_1
        : null

    let order: OrderRow | null = null

    if (referenceOrderId) {
      const { data } = await supabase
        .from('orders')
        .select('id, status, total_cents, billplz_bill_id')
        .eq('id', referenceOrderId)
        .maybeSingle()
      order = (data as OrderRow | null) ?? null
    }

    if (!order) {
      const { data } = await supabase
        .from('orders')
        .select('id, status, total_cents, billplz_bill_id')
        .eq('billplz_bill_id', billId)
        .maybeSingle()
      order = (data as OrderRow | null) ?? null
    }

    if (!order) {
      console.error(
        `[Billplz Webhook] No order for bill ${sanitizeForLog(billId)} (reference_1=${sanitizeForLog(referenceOrderId ?? '')})`,
      )
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 },
      )
    }

    // A bill can only settle the order it was created for.
    if (order.billplz_bill_id && order.billplz_bill_id !== billId) {
      console.error(
        `[Billplz Webhook] Bill ${sanitizeForLog(billId)} does not belong to order ${sanitizeForLog(order.id)}`,
      )
      return NextResponse.json(
        { success: false, error: 'Bill does not match order' },
        { status: 400 },
      )
    }

    // Never trust the callback amount: compare the authoritative paid amount
    // with the total the server calculated at checkout.
    if (paidAmountCents !== order.total_cents) {
      console.error(
        `[Billplz Webhook] Amount mismatch for order ${sanitizeForLog(order.id)}: paid=${paidAmountCents} expected=${order.total_cents}`,
      )
      return NextResponse.json(
        { success: false, error: 'Paid amount does not match order total' },
        { status: 400 },
      )
    }

    await recordBillplzPayment(supabase, order.id, bill, paidAmountCents)

    const result = await finalizePaidOrder(supabase, order.id, {
      paymentPatch: { billplz_bill_id: billId },
      logLabel: 'Billplz Webhook',
    })

    if (result.outcome === 'failed') {
      console.error(
        `[Billplz Webhook] Failed to finalise order ${sanitizeForLog(order.id)}: ${sanitizeForLog(result.error)}`,
      )
      return NextResponse.json(
        { success: false, error: 'Failed to update order' },
        { status: 500 },
      )
    }

    if (result.outcome === 'not_found') {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 },
      )
    }

    return NextResponse.json(
      { success: true, outcome: result.outcome },
      { status: 200 },
    )
  } catch (error) {
    console.error(
      '[Billplz Webhook] Error processing callback:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    )
  }
}
