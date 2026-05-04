import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/supabase/server'

const CreateAddressSchema = z.object({
  label: z.string().max(50).optional(),
  address_line1: z.string().min(1).max(255),
  address_line2: z.string().max(255).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postal_code: z.string().min(1).max(20),
  country: z.string().max(100).optional(),
  instructions: z.string().max(500).optional(),
  is_default: z.boolean().optional(),
})

interface AddressSuccess {
  success: true
  address: Record<string, unknown>
}

interface AddressError {
  success: false
  error: string
}

type AddressResult = AddressSuccess | AddressError

// POST /api/customer/addresses — Create a new address
export async function POST(req: NextRequest): Promise<NextResponse<AddressResult>> {
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

    const parsed = CreateAddressSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') },
        { status: 400 }
      )
    }

    const data = parsed.data

    // Find customer
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

    // Check if this is the first address — auto-set as default
    const { data: existingAddresses } = await supabase
      .from('customer_addresses')
      .select('id')
      .eq('customer_id', customer.id)

    const isDefault = data.is_default ?? (existingAddresses?.length === 0)

    // If setting as default, unset current default first
    if (isDefault) {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', customer.id)
    }

    const { data: address, error } = await supabase
      .from('customer_addresses')
      .insert({
        customer_id: customer.id,
        label: data.label?.trim() || null,
        address_line1: data.address_line1.trim(),
        address_line2: data.address_line2?.trim() || null,
        city: data.city.trim(),
        state: data.state.trim(),
        postal_code: data.postal_code.trim(),
        country: data.country?.trim() || 'Malaysia',
        instructions: data.instructions?.trim() || null,
        is_default: isDefault,
      })
      .select()
      .single()

    if (error) {
      console.error('[API] Failed to create address:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to create address' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, address },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] POST /api/customer/addresses:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
