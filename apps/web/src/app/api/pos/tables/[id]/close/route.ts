import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'

const TABLE_ID = z.string().uuid()

/**
 * Close a dine-in table.
 *
 * A table may close only when every open order is `ready`; the RPC then moves
 * those orders to `picked_up` (the canonical ready → picked_up transition) and
 * writes one event per order. Unpaid or still-cooking tables return 409 with a
 * reason the POS can show.
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

    const { data, error } = await supabase.rpc('close_dine_in_table', {
      p_table_id: id,
      p_actor_id: user.id,
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
          { error: 'Collect payment for the unpaid order before closing the table' },
          { status: 409 }
        )
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
