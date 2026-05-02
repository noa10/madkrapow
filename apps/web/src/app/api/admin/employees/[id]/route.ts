import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { z } from 'zod'

function getNextErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as Record<string, unknown>).message)
        : 'Internal server error'
}

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'manager', 'cashier', 'kitchen']).optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await requireRole(req, ['admin', 'manager'])
    if ('error' in result) return result.error
    const { supabase, user } = result

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const validation = updateEmployeeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const updates: Record<string, unknown> = {}
    if (validation.data.name !== undefined) updates.name = validation.data.name
    if (validation.data.phone !== undefined) updates.phone = validation.data.phone
    if (validation.data.role !== undefined) updates.role = validation.data.role
    if (validation.data.is_active !== undefined) updates.is_active = validation.data.is_active

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Fetch existing employee to get auth_user_id
    const { data: existing, error: fetchError } = await supabase
      .from('employees')
      .select('auth_user_id, role')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: fetchError ? `Database error: ${fetchError.message}` : 'Employee not found' },
        { status: fetchError ? 500 : 404 }
      )
    }

    // Prevent self-deactivation or role downgrade
    if (existing.auth_user_id === user.id && validation.data.is_active === false) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account' },
        { status: 403 }
      )
    }

    if (existing.auth_user_id === user.id && validation.data.role && validation.data.role !== 'admin') {
      return NextResponse.json(
        { error: 'You cannot downgrade your own role' },
        { status: 403 }
      )
    }

    // If role changed, sync auth.users app_metadata
    if (validation.data.role && validation.data.role !== existing.role) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
        existing.auth_user_id,
        { app_metadata: { role: validation.data.role } }
      )
      if (authUpdateError) {
        console.error('[API] Failed to update auth user role:', authUpdateError)
        return NextResponse.json(
          { error: `Failed to update auth role: ${authUpdateError.message}` },
          { status: 500 }
        )
      }
    }

    // Update employees table
    const { data: employee, error: updateError } = await supabase
      .from('employees')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError || !employee) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to update employee' },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: employee })
  } catch (error) {
    const message = getNextErrorMessage(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const result = await requireRole(req, ['admin', 'manager'])
    if ('error' in result) return result.error
    const { supabase, user } = result

    // Fetch existing employee
    const { data: existing, error: fetchError } = await supabase
      .from('employees')
      .select('auth_user_id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: fetchError ? `Database error: ${fetchError.message}` : 'Employee not found' },
        { status: fetchError ? 500 : 404 }
      )
    }

    // Prevent self-deletion
    if (existing.auth_user_id === user.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 403 }
      )
    }

    // Soft delete: set is_active = false
    const { data: employee, error: updateError } = await supabase
      .from('employees')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single()

    if (updateError || !employee) {
      return NextResponse.json(
        { error: updateError?.message || 'Failed to deactivate employee' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: employee })
  } catch (error) {
    const message = getNextErrorMessage(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
