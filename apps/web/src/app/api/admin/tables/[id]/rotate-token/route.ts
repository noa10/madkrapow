import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { recordTableEvent } from '@/lib/pos/table-events'

export const runtime = 'nodejs'

const TableId = z.string().uuid()

/**
 * Rotate a table's QR token.
 *
 * Every previously printed QR for the table stops working immediately — the
 * recovery path when a code has leaked or a table is moved.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!TableId.safeParse(id).success) {
      return NextResponse.json({ error: 'Invalid table id' }, { status: 400 })
    }

    const auth = await requireRole(req, ['admin', 'manager'])
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    const { data, error } = await supabase
      .from('restaurant_tables')
      .update({ qr_token: randomBytes(16).toString('hex') })
      .eq('id', id)
      .select('id, label, qr_token')
      .maybeSingle()

    if (error) {
      console.error('[API/AdminTables] Token rotation failed:', error)
      return NextResponse.json({ error: 'Failed to rotate QR token' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    // Rotation invalidates every printed QR for the table, so it is a
    // security-sensitive action: record who did it (migration 064).
    await recordTableEvent(supabase, {
      tableId: data.id,
      tableLabel: data.label,
      eventType: 'token_rotated',
      actorId: user.id,
    })

    return NextResponse.json({ table: data })
  } catch (err) {
    console.error('[API/AdminTables] Unexpected rotate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
