import { describe, expect, it } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { loadCustomerProfile, ProfileLoadError } from '../profile'

const USER = {
  id: 'user-1',
  email: 'aina@example.com',
  phone: null,
  user_metadata: { full_name: 'Aina' },
} as unknown as User

const ADDRESS = {
  id: 'address-1',
  label: 'Home',
  address_line1: '1 Jalan Test',
  address_line2: null,
  city: 'Johor Bahru',
  state: 'Johor',
  postal_code: '80000',
  country: 'Malaysia',
  instructions: null,
  is_default: true,
  latitude: 1.49,
  longitude: 103.74,
}

const CONTACT = {
  id: 'contact-1',
  name: 'Aina',
  phone: '+60123456789',
  is_default: true,
}

function client(options: {
  customer?: Record<string, unknown> | null
  customerError?: unknown
  created?: Record<string, unknown>
  addresses?: Record<string, unknown>[]
  contacts?: Record<string, unknown>[]
  addressesError?: unknown
  contactsError?: unknown
}) {
  return {
    from(table: string) {
      if (table === 'customers') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.customer ?? null,
                error: options.customerError ?? null,
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: options.created ?? null,
                error: null,
              }),
            }),
          }),
        }
      }

      const rows =
        table === 'customer_addresses'
          ? options.addresses ?? []
          : options.contacts ?? []
      const error =
        table === 'customer_addresses'
          ? options.addressesError ?? null
          : options.contactsError ?? null

      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              order: async () => ({ data: rows, error }),
            }),
          }),
        }),
      }
    },
  } as unknown as SupabaseClient
}

describe('loadCustomerProfile', () => {
  it('returns an existing customer with addresses and contacts', async () => {
    const profile = await loadCustomerProfile(
      USER,
      client({
        customer: { id: 'customer-1', name: 'Aina', phone: null, avatar_url: null },
        addresses: [ADDRESS],
        contacts: [CONTACT],
      }),
    )

    expect(profile.customer).toEqual({
      id: 'customer-1',
      name: 'Aina',
      phone: null,
      email: 'aina@example.com',
      avatarUrl: null,
    })
    expect(profile.addresses).toEqual([ADDRESS])
    expect(profile.contacts).toEqual([CONTACT])
  })

  it('creates the customer row on first use', async () => {
    const profile = await loadCustomerProfile(
      USER,
      client({
        customer: null,
        created: { id: 'customer-new', name: 'Aina', phone: null, avatar_url: null },
        addresses: [],
        contacts: [],
      }),
    )

    expect(profile.customer.id).toBe('customer-new')
    expect(profile.addresses).toEqual([])
    expect(profile.contacts).toEqual([])
  })

  it('throws a 401 when the user has no email', async () => {
    await expect(
      loadCustomerProfile(
        { ...USER, email: null } as unknown as User,
        client({ customer: null }),
      ),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('throws a ProfileLoadError when the customer read fails', async () => {
    await expect(
      loadCustomerProfile(
        USER,
        client({ customerError: { message: 'db down' } }),
      ),
    ).rejects.toBeInstanceOf(ProfileLoadError)
  })

  it('still returns the profile when address/contact reads fail', async () => {
    const profile = await loadCustomerProfile(
      USER,
      client({
        customer: { id: 'customer-1', name: 'Aina', phone: null, avatar_url: null },
        addressesError: { message: 'addresses down' },
        contactsError: { message: 'contacts down' },
      }),
    )

    expect(profile.customer.id).toBe('customer-1')
    expect(profile.addresses).toEqual([])
    expect(profile.contacts).toEqual([])
  })
})
