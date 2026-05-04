import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/supabase/server'

const UpdateAddressSchema = z.object({
  label: z.string().max(50).optional(),
  address_line1: z.string().min(1).max(255).optional(),
  address_line2: z.string().max(255).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  postal_code: z.string().min(1).max(20).optional(),
  country: z.string().max(100).optional(),
  instructions: z.string().max(500).optional(),
})

interface AddressResult {
  success: boolean
  address?: Record<string, unknown>
  error?: string
}

// PUT /api/customer/addresses/[id] — Update an address
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<AddressResult>> {
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

    const parsed = UpdateAddressSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') },
        { status: 400 }
      )
    }

    const data = parsed.data
    const updates: Record<string, unknown> = {}

    if (data.label !== undefined) updates.label = data.label?.trim() || null
    if (data.address_line1 !== undefined) updates.address_line1 = data.address_line1.trim()
    if (data.address_line2 !== undefined) updates.address_line2 = data.address_line2?.trim() || null
    if (data.city !== undefined) updates.city = data.city.trim()
    if (data.state !== undefined) updates.state = data.state.trim()
    if (data.postal_code !== undefined) updates.postal_code = data.postal_code.trim()
    if (data.country !== undefined) updates.country = data.country?.trim() || 'Malaysia'
    if (data.instructions !== undefined) updates.instructions = data.instructions?.trim() || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    // Verify ownership
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

    const { data: existingAddress } = await supabase
      .from('customer_addresses')
      .select('id')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .maybeSingle()

    if (!existingAddress) {
      return NextResponse.json(
        { success: false, error: 'Address not found' },
        { status: 404 }
      )
    }

    const { data: address, error } = await supabase
      .from('customer_addresses')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[API] Failed to update address:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update address' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, address },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] PUT /api/customer/addresses:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

// DELETE /api/customer/addresses/[id] — Delete an address
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<AddressResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)
    const { id } = await params

    if (!user || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify ownership
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

    const { data: existingAddress } = await supabase
      .from('customer_addresses')
      .select('id, is_default')
      .eq('id', id)
      .eq('customer_id', customer.id)
      .maybeSingle()

    if (!existingAddress) {
      return NextResponse.json(
        { success: false, error: 'Address not found' },
        { status: 404 }
      )
    }

    const { error } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[API] Failed to delete address:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to delete address' },
        { status: 500 }
      )
    }

    // If deleted address was default, set another as default
    if (existingAddress.is_default) {
      const { data: nextAddress } = await supabase
        .from('customer_addresses')
        .select('id')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (nextAddress) {
        await supabase
          .from('customer_addresses')
          .update({ is_default: true })
          .eq('id', nextAddress.id)
      }
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] DELETE /api/customer/addresses:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
