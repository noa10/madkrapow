import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'

const TABLE_ID = z.string().uuid()

/**
 * The tickets the cashier saw when the dialog opened. The RPC refuses the
 * close when the live open set differs, so a round that lands while the dialog
 * is open can never be completed unseen.
 */
const CLOSE_BODY = z.object({
  order_ids: z.array(z.string().uuid()).min(1).max(200),
})

/**
 * Close a dine-in table.
 *
 * The bill is the gate: once no ticket at the table is `pending`, the RPC
 * completes every confirmed order to `picked_up` and writes one event per
 * order, preserving the status it came from. Unpaid tables return 409 with a
 * reason the POS can show.
 *
 * `not_ready` is no longer produced (migration 061) but is still mapped so a
 * web deploy that lands before its migration degrades to a clear message
 * instead of a generic 500. `stale_close` (migration 062) means the table
 * changed after the dialog opened; the caller refreshes and re-confirms.
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

    const body = CLOSE_BODY.safeParse(await req.json().catch(() => null))
    if (!body.success) {
      return NextResponse.json(
        { error: 'Send the order ids you are closing' },
        { status: 400 }
      )
    }

    const auth = await requireRole(req, ['admin', 'manager', 'cashier'])
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const { data, error } = await supabase.rpc('close_dine_in_table', {
      p_table_id: id,
      p_actor_id: user.id,
      p_expected_order_ids: body.data.order_ids,
    })

    if (error) {
      console.error('[API/POS] Close table RPC failed:', error)
      return NextResponse.json({ error: 'Failed to close table' }, { status: 500 })
    }

    const result = data as { ok?: boolean; code?: string; closed?: number } | null

    if (result?.ok) {
      return NextResponse.json({ success: true, closed: result.closed ?? 0 })
    }

    switch (result?.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Table not found' }, { status: 404 })
      case 'empty':
        return NextResponse.json({ error: 'This table has no open orders' }, { status: 409 })
      case 'unpaid':
        return NextResponse.json(
          {
            error: 'Collect payment for the unpaid order before closing the table',
            code: 'unpaid',
          },
          { status: 409 }
        )
      case 'stale_close':
        return NextResponse.json(
          {
            error: 'The table changed while you were closing it',
            code: 'stale_close',
          },
          { status: 409 }
        )
      // Only reachable against a database still running migration 057.
      case 'not_ready':
        return NextResponse.json(
          { error: 'The kitchen must mark every order ready before the table can close' },
          { status: 409 }
        )
      default:
        return NextResponse.json({ error: 'Failed to close table' }, { status: 500 })
    }
  } catch (err) {
    console.error('[API/POS] Unexpected close-table error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
