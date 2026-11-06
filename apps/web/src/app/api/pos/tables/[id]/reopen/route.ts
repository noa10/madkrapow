import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'

const TABLE_ID = z.string().uuid()

/**
 * Why the table is being reopened. Stored verbatim in table_events.details, so
 * the audit row explains itself without joining order events.
 */
const REOPEN_BODY = z.object({
  reason: z.string().trim().min(3).max(500),
})

/**
 * Reopen a dine-in table closed earlier today.
 *
 * The inverse of `/close`, deliberately narrower: admin/manager only, same
 * Asia/Kuala_Lumpur calendar day, and refused while the table has open orders
 * (a new party must never inherit an earlier round). The RPC restores today's
 * close_dine_in_table completions to `ready` and writes both audit surfaces;
 * delivery orders are untouched.
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

    const body = REOPEN_BODY.safeParse(await req.json().catch(() => null))
    if (!body.success) {
      return NextResponse.json(
        { error: 'Enter a reason of at least 3 characters' },
        { status: 400 }
      )
    }

    const auth = await requireRole(req, ['admin', 'manager'])
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const { data, error } = await supabase.rpc('reopen_dine_in_table', {
      p_table_id: id,
      p_actor_id: user.id,
      p_reason: body.data.reason,
    })

    if (error) {
      console.error('[API/POS] Reopen table RPC failed:', error)
      return NextResponse.json(
        { error: 'Failed to reopen table' },
        { status: 500 }
      )
    }

    const result = data as { ok?: boolean; code?: string; reopened?: number } | null

    if (result?.ok) {
      return NextResponse.json({ success: true, reopened: result.reopened ?? 0 })
    }

    switch (result?.code) {
      case 'not_found':
        return NextResponse.json({ error: 'Table not found' }, { status: 404 })
      case 'not_closed':
        return NextResponse.json(
          {
            error: 'Nothing was closed at this table today',
            code: 'not_closed',
          },
          { status: 409 }
        )
      case 'occupied':
        return NextResponse.json(
          {
            error: 'This table already has open orders — close them before reopening',
            code: 'occupied',
          },
          { status: 409 }
        )
      case 'reason_required':
        return NextResponse.json(
          { error: 'Enter a reason for reopening the table' },
          { status: 400 }
        )
      default:
        return NextResponse.json(
          { error: 'Failed to reopen table' },
          { status: 500 }
        )
    }
  } catch (err) {
    console.error('[API/POS] Unexpected reopen-table error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
