import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/supabase/server'

interface CustomerAddress {
  id: string
  label: string | null
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  instructions: string | null
  is_default: boolean
}

interface CustomerContact {
  id: string
  name: string
  phone: string
  is_default: boolean
}

interface Customer {
  id: string
  name: string | null
  phone: string | null
  email: string | null
}

interface ProfileResponse {
  success: true
  customer: Customer
  addresses: CustomerAddress[]
  contacts: CustomerContact[]
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

    const [addressesRes, contactsRes] = await Promise.all([
      supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', resolvedCustomer.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('customer_contacts')
        .select('*')
        .eq('customer_id', resolvedCustomer.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (addressesRes.error) {
      console.error('[API] Failed to fetch addresses:', addressesRes.error)
    }

    if (contactsRes.error) {
      console.error('[API] Failed to fetch contacts:', contactsRes.error)
    }

    return NextResponse.json(
      {
        success: true,
        customer: {
          id: resolvedCustomer.id,
          name: resolvedCustomer.name,
          phone: resolvedCustomer.phone,
          email: user.email || null,
        },
        addresses: addressesRes.data || [],
        contacts: contactsRes.data || [],
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

export async function PATCH(req: NextRequest): Promise<NextResponse<ProfileResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { name, phone } = body

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

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name?.trim() || null
    if (phone !== undefined) updates.phone = phone?.trim() || null

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', customer.id)

    if (error) {
      console.error('[API] Failed to update customer:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    if (name !== undefined) {
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { full_name: name?.trim() || null },
      })
    }

    return NextResponse.json(
      {
        success: true,
        customer: {
          id: customer.id,
          name: name?.trim() || null,
          phone: phone?.trim() || null,
          email: user.email || null,
        },
        addresses: [],
        contacts: [],
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] PATCH /api/customer/profile:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
