import { randomBytes } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { recordTableEvent } from '@/lib/pos/table-events'

export const runtime = 'nodejs'

const TableCreateSchema = z.object({
  label: z.string().trim().min(1).max(40),
  zone: z.string().trim().max(60).nullish(),
  seats: z.number().int().min(1).max(50).default(2),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
})

const PG_UNIQUE_VIOLATION = '23505'

function newQrToken(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Create a restaurant table and its QR capability token.
 *
 * Admins/managers own the floor plan. Tokens are generated server-side and
 * never accepted from the client, so a caller cannot plant a known token.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(req, ['admin', 'manager'])
    if ('error' in auth) return auth.error
    const { user, supabase } = auth

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = TableCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('restaurant_tables')
      .insert({
        label: parsed.data.label,
        zone: parsed.data.zone ?? null,
        seats: parsed.data.seats,
        sort_order: parsed.data.sort_order ?? 0,
        is_active: parsed.data.is_active ?? true,
        qr_token: newQrToken(),
      })
      .select('id, label, zone, seats, qr_token, is_active, sort_order')
      .single()

    if (error) {
      if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        return NextResponse.json(
          { error: `A table labelled "${parsed.data.label}" already exists` },
          { status: 409 }
        )
      }
      console.error('[API/AdminTables] Create failed:', error)
      return NextResponse.json({ error: 'Failed to create table' }, { status: 500 })
    }

    await recordTableEvent(supabase, {
      tableId: data.id,
      tableLabel: data.label,
      eventType: 'created',
      actorId: user.id,
      details: {
        zone: data.zone,
        seats: data.seats,
        is_active: data.is_active,
      },
    })

    return NextResponse.json({ table: data }, { status: 201 })
  } catch (err) {
    console.error('[API/AdminTables] Unexpected create error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
