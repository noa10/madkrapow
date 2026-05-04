import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/supabase/server'

const CreateContactSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().min(1).max(20),
  is_default: z.boolean().optional(),
})

interface ContactSuccess {
  success: true
  contact: Record<string, unknown>
}

interface ContactError {
  success: false
  error: string
}

type ContactResult = ContactSuccess | ContactError

export async function POST(req: NextRequest): Promise<NextResponse<ContactResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)

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

    const parsed = CreateContactSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') },
        { status: 400 }
      )
    }

    const data = parsed.data

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

    const { data: existingContacts } = await supabase
      .from('customer_contacts')
      .select('id')
      .eq('customer_id', customer.id)

    const isDefault = data.is_default ?? (existingContacts?.length === 0)

    if (isDefault) {
      await supabase
        .from('customer_contacts')
        .update({ is_default: false })
        .eq('customer_id', customer.id)
    }

    const { data: contact, error } = await supabase
      .from('customer_contacts')
      .insert({
        customer_id: customer.id,
        name: data.name.trim(),
        phone: data.phone.trim(),
        is_default: isDefault,
      })
      .select()
      .single()

    if (error) {
      console.error('[API] Failed to create contact:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create contact' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, contact },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] POST /api/customer/contacts:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
