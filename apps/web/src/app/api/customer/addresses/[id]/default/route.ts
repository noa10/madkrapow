import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/server'

interface DefaultResult {
  success: boolean
  error?: string
}

// PATCH /api/customer/addresses/[id]/default — Set an address as default
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<DefaultResult>> {
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

    // Unset current default
    await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('customer_id', customer.id)

    // Set new default
    const { error } = await supabase
      .from('customer_addresses')
      .update({ is_default: true })
      .eq('id', id)

    if (error) {
      console.error('[API] Failed to set default address:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to set default address' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] PATCH /api/customer/addresses/default:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
