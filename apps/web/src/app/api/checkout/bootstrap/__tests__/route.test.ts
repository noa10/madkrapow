import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetAuthenticatedUser,
  mockLoadCustomerProfile,
  mockGetAvailablePaymentMethods,
  mockGetAutoAppliedPromos,
} = vi.hoisted(() => ({
  mockGetAuthenticatedUser: vi.fn(),
  mockLoadCustomerProfile: vi.fn(),
  mockGetAvailablePaymentMethods: vi.fn(),
  mockGetAutoAppliedPromos: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
}))

vi.mock('@/lib/customer/profile', () => ({
  loadCustomerProfile: (...args: unknown[]) => mockLoadCustomerProfile(...args),
}))

vi.mock('@/lib/payments/availability', () => ({
  getAvailablePaymentMethods: () => mockGetAvailablePaymentMethods(),
}))

vi.mock('@/lib/promos/auto', () => ({
  getAutoAppliedPromos: (...args: unknown[]) => mockGetAutoAppliedPromos(...args),
}))

import { POST } from '../route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/checkout/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Request
}

const PROFILE = {
  customer: {
    id: 'customer-1',
    name: 'Aina',
    phone: '+60123456789',
    email: 'aina@example.com',
    avatarUrl: null,
  },
  addresses: [{ id: 'address-1', address_line1: '1 Jalan Test' }],
  contacts: [{ id: 'contact-1', name: 'Aina', phone: '+60123456789' }],
}

const METHODS = [{ id: 'stripe', label: 'Card (Stripe)', description: 'Card' }]

const PROMOS = [
  {
    code: 'AUTO10',
    description: '10% off',
    scope: 'order',
    discountType: 'percentage' as const,
    discountValue: 10,
    discountCents: 250,
    targetItemIds: [],
    minOrderCents: null,
    validFrom: '2026-01-01T00:00:00Z',
    validUntil: '2027-01-01T00:00:00Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuthenticatedUser.mockResolvedValue({
    user: { id: 'user-1', email: 'aina@example.com' },
    supabase: { from: vi.fn() },
  })
  mockLoadCustomerProfile.mockResolvedValue(PROFILE)
  mockGetAvailablePaymentMethods.mockReturnValue(METHODS)
  mockGetAutoAppliedPromos.mockResolvedValue(PROMOS)
})

describe('POST /api/checkout/bootstrap', () => {
  it('returns the profile, payment methods and auto-promos in one response', async () => {
    const res = await POST(
      makeRequest({ subtotalCents: 2500, deliveryFeeCents: 500 }) as never,
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      success: true,
      customer: PROFILE.customer,
      addresses: PROFILE.addresses,
      contacts: PROFILE.contacts,
      methods: METHODS,
      applied: PROMOS,
      profileUnavailable: false,
    })

    expect(mockLoadCustomerProfile).toHaveBeenCalledTimes(1)
    expect(mockGetAvailablePaymentMethods).toHaveBeenCalledTimes(1)
    expect(mockGetAutoAppliedPromos).toHaveBeenCalledWith(
      expect.anything(),
      2500,
      500,
    )
  })

  it('returns 401 without an authenticated user', async () => {
    mockGetAuthenticatedUser.mockResolvedValue({ user: null, supabase: null })

    const res = await POST(
      makeRequest({ subtotalCents: 2500, deliveryFeeCents: 500 }) as never,
    )

    expect(res.status).toBe(401)
    expect(mockLoadCustomerProfile).not.toHaveBeenCalled()
    expect(mockGetAutoAppliedPromos).not.toHaveBeenCalled()
  })

  it('returns 400 for a malformed body', async () => {
    const res = await POST(
      makeRequest({ subtotalCents: -1, deliveryFeeCents: 'free' }) as never,
    )

    expect(res.status).toBe(400)
    expect(mockLoadCustomerProfile).not.toHaveBeenCalled()
  })

  it('still returns methods and promos when the profile read fails', async () => {
    mockLoadCustomerProfile.mockRejectedValue(new Error('db down'))

    const res = await POST(
      makeRequest({ subtotalCents: 2500, deliveryFeeCents: 500 }) as never,
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      success: true,
      customer: null,
      addresses: [],
      contacts: [],
      methods: METHODS,
      applied: PROMOS,
      profileUnavailable: true,
    })
  })

  it('skips the promo query for an empty cart', async () => {
    const res = await POST(
      makeRequest({ subtotalCents: 0, deliveryFeeCents: 0 }) as never,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ applied: [] })
    expect(mockGetAutoAppliedPromos).not.toHaveBeenCalled()
  })
})
