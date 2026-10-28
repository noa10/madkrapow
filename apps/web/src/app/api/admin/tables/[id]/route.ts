import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { recordTableEvent } from '@/lib/pos/table-events'

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
    const { user, supabase } = auth

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
    // unreachable on the POS table board. `deactivate_restaurant_table` locks
    // the row, checks and writes in one transaction, so a counter order cannot
    // land between the count and the write. It also records the audit event.
    let deactivatedTable: Record<string, unknown> | null = null
    if (parsed.data.is_active === false) {
      const { data: deactivateData, error: deactivateError } = await supabase.rpc(
        'deactivate_restaurant_table',
        { p_table_id: id, p_actor_id: user.id }
      )

      if (deactivateError) {
        console.error('[API/AdminTables] Deactivate RPC failed:', deactivateError)
        return NextResponse.json({ error: 'Failed to update table' }, { status: 500 })
      }

      const result = deactivateData as
        | { ok?: boolean; code?: string; table?: Record<string, unknown> }
        | null

      if (!result?.ok) {
        if (result?.code === 'has_orders') {
          return NextResponse.json(
            {
              error:
                'This table still has open orders. Close the table before deactivating it.',
            },
            { status: 409 }
          )
        }
        if (result?.code === 'not_found') {
          return NextResponse.json({ error: 'Table not found' }, { status: 404 })
        }
        return NextResponse.json({ error: 'Failed to update table' }, { status: 500 })
      }

      deactivatedTable = result.table ?? null
      delete updates.is_active
    }

    // The RPC already applied the deactivation; a combined edit only needs the
    // remaining fields. If that update fails the table stays deactivated — the
    // guard has passed, and the manager can retry the field change.
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ table: deactivatedTable })
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

    const changedFields = Object.keys(updates).filter((key) => key !== 'is_active')
    if (parsed.data.is_active === true) {
      await recordTableEvent(supabase, {
        tableId: data.id,
        tableLabel: data.label,
        eventType: 'activated',
        actorId: user.id,
        details: { fields: changedFields },
      })
    } else if (changedFields.length > 0) {
      await recordTableEvent(supabase, {
        tableId: data.id,
        tableLabel: data.label,
        eventType: 'updated',
        actorId: user.id,
        details: { fields: changedFields },
      })
    }

    return NextResponse.json({ table: data })
  } catch (err) {
    console.error('[API/AdminTables] Unexpected update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Delete a table only when no order references it. Historical orders keep a
 * `table_label` snapshot, but deleting the row would null their `table_id`;
 * deactivate instead when the table has history.
 *
 * The history check and the delete run inside `delete_restaurant_table`, so a
 * counter order cannot land between them and be orphaned by the FK's
 * ON DELETE SET NULL.
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
    const { user, supabase } = auth

    const { data, error } = await supabase.rpc('delete_restaurant_table', {
      p_table_id: id,
      p_actor_id: user.id,
    })

    if (error) {
      console.error('[API/AdminTables] Delete RPC failed:', error)
      return NextResponse.json({ error: 'Failed to delete table' }, { status: 500 })
    }

    const result = data as { ok?: boolean; code?: string } | null

    if (result?.ok) {
      return NextResponse.json({ success: true })
    }

    if (result?.code === 'has_orders') {
      return NextResponse.json(
        { error: 'This table has order history. Deactivate it instead of deleting.' },
        { status: 409 }
      )
    }

    if (result?.code === 'not_found') {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 })
    }

    return NextResponse.json({ error: 'Failed to delete table' }, { status: 500 })
  } catch (err) {
    console.error('[API/AdminTables] Unexpected delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
