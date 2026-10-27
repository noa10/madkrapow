import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'

const TABLE_ID = z.guid()

const SettleTableSchema = z.object({
  payment_method: z.enum(['cash', 'qr_pay']),
  /** The exact tickets the cashier confirmed; the RPC rejects a changed set. */
  order_ids: z.array(z.guid()).min(1).max(100),
})

/**
 * Collect payment for every unpaid dine-in order at a table in one flow.
 *
 * The counter shows one grouped total per table; `settle_dine_in_table` writes
 * one payments row per order (the ledger stays per ticket) and marks them all
 * paid atomically. A concurrent collect finds nothing left and returns 409.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!TABLE_ID.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid table id' }, { status: 400 })
    }

    const auth = await requireRole(req, ['admin', 'manager', 'cashier'])
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = SettleTableSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('settle_dine_in_table', {
      p_table_id: id,
      p_method: parsed.data.payment_method,
      p_actor_id: user.id,
      p_expected_order_ids: parsed.data.order_ids,
    })

    if (error) {
      console.error('[API/POS] Settle table RPC failed:', error)
      return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }

    const result = data as {
      ok?: boolean
      code?: string
      settled_count?: number
      amount_cents?: number
    } | null

    if (result?.ok) {
      return NextResponse.json({
        success: true,
        settled_count: result.settled_count ?? 0,
        amount_cents: result.amount_cents ?? 0,
      })
    }

    switch (result?.code) {
      case 'stale_settle':
        return NextResponse.json(
          {
            error:
              'The table changed while you were collecting. Review the new total and try again.',
            code: 'stale_settle',
          },
          { status: 409 }
        )
      case 'nothing_to_settle':
        return NextResponse.json(
          {
            error: 'Nothing left to collect at this table — it may have just been paid.',
            code: 'nothing_to_settle',
          },
          { status: 409 }
        )
      case 'invalid_method':
        return NextResponse.json({ error: 'Unsupported payment method' }, { status: 400 })
      default:
        return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
    }
  } catch (err) {
    console.error('[API/POS] Unexpected settle-table error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
