import type { SupabaseClient, User } from '@supabase/supabase-js'

export interface CustomerAddress {
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
  latitude?: number | null
  longitude?: number | null
}

export interface CustomerContact {
  id: string
  name: string
  phone: string
  is_default: boolean
}

export interface CustomerProfile {
  customer: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    avatarUrl: string | null
  }
  addresses: CustomerAddress[]
  contacts: CustomerContact[]
}

export class ProfileLoadError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'ProfileLoadError'
    this.status = status
  }
}

interface CustomerRow {
  id: string
  name: string | null
  phone: string | null
  avatar_url: string | null
}

/**
 * Load the signed-in customer's profile, creating the `customers` row on
 * first use. Shared by `GET /api/customer/profile` and the checkout
 * bootstrap endpoint so both surfaces read the same record in one pass.
 *
 * Address/contact read errors are logged but do not fail the profile: the
 * checkout must still render with an empty saved-address list. A customer
 * lookup/create failure is fatal and throws `ProfileLoadError`.
 */
export async function loadCustomerProfile(
  user: User,
  supabase: SupabaseClient,
): Promise<CustomerProfile> {
  if (!user.email) {
    throw new ProfileLoadError('Unauthorized', 401)
  }

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (customerError) {
    console.error('[API] Failed to fetch customer:', customerError)
    throw new ProfileLoadError('Failed to load customer profile')
  }

  let resolvedCustomer = customer as CustomerRow | null

  if (!resolvedCustomer) {
    const googleAvatarUrl =
      user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null

    const { data: createdCustomer, error: createCustomerError } = await supabase
      .from('customers')
      .insert({
        auth_user_id: user.id,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
        phone: user.phone ?? null,
        avatar_url: googleAvatarUrl,
      })
      .select('*')
      .single()

    if (createCustomerError || !createdCustomer) {
      console.error('[API] Failed to create customer:', createCustomerError)
      throw new ProfileLoadError('Failed to initialize customer profile')
    }

    resolvedCustomer = createdCustomer as CustomerRow
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

  return {
    customer: {
      id: resolvedCustomer.id,
      name: resolvedCustomer.name,
      phone: resolvedCustomer.phone,
      email: user.email || null,
      avatarUrl: resolvedCustomer.avatar_url ?? null,
    },
    addresses: (addressesRes.data ?? []) as CustomerAddress[],
    contacts: (contactsRes.data ?? []) as CustomerContact[],
  }
}
