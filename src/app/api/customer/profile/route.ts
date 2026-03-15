import { NextResponse } from 'next/server'
import { getServerClient } from '@/lib/supabase/server'

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

export async function GET(): Promise<NextResponse<ProfileResult>> {
  try {
    const supabase = await getServerClient()

    const { data: { user } } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('auth_user_id', user.id)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { success: false, error: 'Customer not found' },
        { status: 404 }
      )
    }

    const { data: addresses, error: addressesError } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customer.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })

    if (addressesError) {
      console.error('[API] Failed to fetch addresses:', addressesError)
    }

    return NextResponse.json(
      {
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
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
