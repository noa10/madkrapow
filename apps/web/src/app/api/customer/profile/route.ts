import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/server'

interface CustomerAddress {
  id: string
  label: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  instructions: string | null
  is_default: boolean
}

interface Customer {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  addresses: CustomerAddress[]
}

interface ProfileResponse {
  success: true
  customer: Customer
}

interface ProfileError {
  success: false
  error: string
}

type ProfileResult = ProfileResponse | ProfileError

export async function GET(req: NextRequest): Promise<NextResponse<ProfileResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !user.email || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (customerError) {
      console.error('[API] Failed to fetch customer:', customerError)
      return NextResponse.json(
        { success: false, error: 'Failed to load customer profile' },
        { status: 500 }
      )
    }

    let resolvedCustomer = customer

    if (!resolvedCustomer) {
      const { data: createdCustomer, error: createCustomerError } = await supabase
        .from('customers')
        .insert({
          auth_user_id: user.id,
          name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
          phone: user.phone ?? null,
        })
        .select('*')
        .single()

      if (createCustomerError || !createdCustomer) {
        console.error('[API] Failed to create customer:', createCustomerError)
        return NextResponse.json(
          { success: false, error: 'Failed to initialize customer profile' },
          { status: 500 }
        )
      }

      resolvedCustomer = createdCustomer
    }

    const { data: addresses, error: addressesError } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', resolvedCustomer.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (addressesError) {
      console.error('[API] Failed to fetch addresses:', addressesError)
    }

    return NextResponse.json(
      {
        success: true,
        customer: {
          id: resolvedCustomer.id,
          name: resolvedCustomer.name,
          phone: resolvedCustomer.phone,
          email: user.email || null,
          addresses: addresses || [],
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/customer/profile:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
