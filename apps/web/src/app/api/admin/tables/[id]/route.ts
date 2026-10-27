import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'

const TableId = z.string().uuid()

const TableUpdateSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  zone: z.string().trim().max(60).nullish(),
  seats: z.number().int().min(1).max(50).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
})

const PG_UNIQUE_VIOLATION = '23505'

/** Edit a table, including deactivating it (preferred over deletion). */
export async function PATCH(
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
    const { supabase } = auth

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = TableUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.label !== undefined) updates.label = parsed.data.label
    if (parsed.data.zone !== undefined) updates.zone = parsed.data.zone ?? null
    if (parsed.data.seats !== undefined) updates.seats = parsed.data.seats
    if (parsed.data.sort_order !== undefined) updates.sort_order = parsed.data.sort_order
    if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No changes supplied' }, { status: 400 })
    }

    // Deactivating a table with open orders would make those orders
    // unreachable on the POS table board. Close the table first.
    if (parsed.data.is_active === false) {
      const { count, error: openOrdersError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('table_id', id)
        .in('status', ['pending', 'paid', 'accepted', 'preparing', 'ready'])

      if (openOrdersError) {
        console.error('[API/AdminTables] Open order check failed:', openOrdersError)
        return NextResponse.json({ error: 'Failed to update table' }, { status: 500 })
      }
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: 'This table still has open orders. Close the table before deactivating it.' },
          { status: 409 }
        )
      }
    }

    const { data, error } = await supabase
      .from('restaurant_tables')
      .update(updates)
      .eq('id', id)
      .select('id, label, zone, seats, qr_token, is_active, sort_order')
      .maybeSingle()

    if (error) {
      if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        return NextResponse.json(
          { error: 'Another table already uses that label' },
          { status: 409 }
        )
      }
      console.error('[API/AdminTables] Update failed:', error)
      return NextResponse.json({ error: 'Failed to update table' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    return NextResponse.json({ table: data })
  } catch (err) {
    console.error('[API/AdminTables] Unexpected update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const PG_FOREIGN_KEY_VIOLATION = '23503'

/**
 * Delete a table only when no order references it. Historical orders keep a
 * `table_label` snapshot, but deleting the row would null their `table_id`;
 * deactivate instead when the table has history.
 */
export async function DELETE(
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
    const { supabase } = auth

    const { count, error: countError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('table_id', id)

    if (countError) {
      console.error('[API/AdminTables] Order reference check failed:', countError)
      return NextResponse.json({ error: 'Failed to delete table' }, { status: 500 })
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'This table has order history. Deactivate it instead of deleting.' },
        { status: 409 }
      )
    }

    const { error } = await supabase.from('restaurant_tables').delete().eq('id', id)

    if (error) {
      if ((error as { code?: string }).code === PG_FOREIGN_KEY_VIOLATION) {
        return NextResponse.json(
          { error: 'This table is still in use. Deactivate it instead.' },
          { status: 409 }
        )
      }
      console.error('[API/AdminTables] Delete failed:', error)
      return NextResponse.json({ error: 'Failed to delete table' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API/AdminTables] Unexpected delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
