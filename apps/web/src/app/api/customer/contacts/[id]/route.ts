import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/supabase/server'

const UpdateContactSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().min(1).max(20).optional(),
})

interface ContactResult {
  success: boolean
  contact?: Record<string, unknown>
  error?: string
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ContactResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)
    const { id } = await params

    if (!user || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      )
    }

    const parsed = UpdateContactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') },
        { status: 400 }
      )
    }

    const data = parsed.data
    const updates: Record<string, unknown> = {}

    if (data.name !== undefined) updates.name = data.name.trim()
    if (data.phone !== undefined) updates.phone = data.phone.trim()

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer profile not found' },
        { status: 404 }
      )
    }

    const { data: existingContact } = await supabase
      .from('customer_contacts')
      .select('id')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .maybeSingle()

    if (!existingContact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      )
    }

    const { data: contact, error } = await supabase
      .from('customer_contacts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[API] Failed to update contact:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update contact' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, contact },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] PUT /api/customer/contacts:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ContactResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)
    const { id } = await params

    if (!user || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer profile not found' },
        { status: 404 }
      )
    }

    const { data: existingContact } = await supabase
      .from('customer_contacts')
      .select('id, is_default')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .maybeSingle()

    if (!existingContact) {
      return NextResponse.json(
        { success: false, error: 'Contact not found' },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from('customer_contacts')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[API] Failed to delete contact:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete contact' },
        { status: 500 }
      )
    }

    if (existingContact.is_default) {
      const { data: nextContact } = await supabase
        .from('customer_contacts')
        .select('id')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (nextContact) {
        await supabase
          .from('customer_contacts')
          .update({ is_default: true })
          .eq('id', nextContact.id)
      }
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] DELETE /api/customer/contacts:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
