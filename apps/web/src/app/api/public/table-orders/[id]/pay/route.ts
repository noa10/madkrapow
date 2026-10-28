/**
 * POST /api/public/table-orders/[id]/pay
 *
 * The diner's "I've paid" claim on the table-QR page. The phone shows the
 * merchant's DuitNow QR; when the diner taps the confirmation, this route
 * marks the order paid (`pending -> paid`), writes the `qr_pay` ledger row and
 * returns the receipt fields the success screen renders.
 *
 * The claim is self-declared: the server cannot see the bank transfer. The
 * `payments.raw.claimed_via = 'table_qr'` marker records that provenance and
 * the receipt asks the cashier to verify the transfer. Recovery for a false
 * claim is manual (cancel/refund), so the route must stay scoped: the table
 * token proves the caller is at the table, and the order's idempotency key
 * proves they created this order (migration 065).
 *
 * The RPC is idempotent, so a retry (lost response, double tap) returns
 * `already_paid` with the real status instead of charging twice.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase/server'
import { sanitizeForLog } from '@/lib/logging/safe-log'

export const runtime = 'nodejs'

const PaySchema = z.object({
  table_token: z.string().trim().min(16).max(128),
  idempotency_key: z.string().trim().min(16).max(128),
})

/** Shape returned by `claim_table_order_payment` (migration 065). */
interface ClaimRpcResult {
  ok?: boolean
  code?: string
  status?: string
  amount_cents?: number
  payment_method?: string | null
  paid_at?: string | null
  already_paid?: boolean
}

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

  const parsed = PaySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Seeded ids are UUID-shaped but not RFC 4122 v4; `z.guid()` accepts any
  // 8-4-4-4-12 hex shape and the RPC still enforces membership.
  if (!z.guid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
  }

  const input = parsed.data
  const supabase = getServiceClient()

  // Token → active table, exactly like the create route: the token is never
  // enumerable through PostgREST, and an inactive table cannot be claimed.
  const { data: table, error: tableError } = await supabase
    .from('restaurant_tables')
    .select('id, is_active')
    .eq('qr_token', input.table_token)
    .maybeSingle()

  if (tableError) {
    console.error('[API/TableOrderPay] Table lookup failed:', tableError)
    return NextResponse.json({ error: 'Unable to validate table' }, { status: 500 })
  }
  if (!table || !table.is_active) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const { data, error } = await supabase.rpc('claim_table_order_payment', {
    p_order_id: id,
    p_table_id: table.id,
    p_idempotency_key: input.idempotency_key,
  })

  if (error) {
    console.error(
      '[API/TableOrderPay] Claim failed:',
      sanitizeForLog(error.message)
    )
    return NextResponse.json({ error: 'Unable to record payment' }, { status: 500 })
  }

  const result = (data ?? null) as ClaimRpcResult | null
  if (!result) {
    console.error('[API/TableOrderPay] Claim returned no result')
    return NextResponse.json({ error: 'Unable to record payment' }, { status: 500 })
  }

  if (result.ok !== true) {
    if (result.code === 'not_found') {
      // Same copy for a wrong table and a wrong key: do not reveal which.
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (result.code === 'not_pending') {
      const status = result.status ?? 'unknown'
      return NextResponse.json(
        {
          error:
            status === 'cancelled'
              ? 'This order was cancelled. Please ask a staff member.'
              : 'This order can no longer be paid online. Please ask a staff member.',
          status,
        },
        { status: 409 }
      )
    }
    // Fail closed: a result without `ok: true` is never a recorded payment.
    // Answering 200 here would tell the diner their money was recorded when
    // nothing was written.
    console.error(
      '[API/TableOrderPay] Unexpected claim result:',
      result.code ?? 'no code'
    )
    return NextResponse.json({ error: 'Unable to record payment' }, { status: 500 })
  }

  return NextResponse.json(
    {
      ok: true,
      order_id: id,
      status: result.status ?? 'paid',
      amount_cents: result.amount_cents ?? 0,
      payment_method: result.payment_method ?? null,
      paid_at: result.paid_at ?? null,
      already_paid: result.already_paid ?? false,
    },
    { status: 200 }
  )
}
