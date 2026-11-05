import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetServiceClient,
  mockGetAutoAppliedPromos,
  MockAutoPromoQueryError,
} = vi.hoisted(() => {
  class MockAutoPromoQueryError extends Error {}
  return {
    mockGetServiceClient: vi.fn(),
    mockGetAutoAppliedPromos: vi.fn(),
    MockAutoPromoQueryError,
  }
})

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => mockGetServiceClient(),
}))

vi.mock('@/lib/promos/auto', () => ({
  AutoPromoQueryError: MockAutoPromoQueryError,
  getAutoAppliedPromos: (...args: unknown[]) => mockGetAutoAppliedPromos(...args),
}))

import { POST } from '../route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/promos/auto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Request
}

const PROMO = {
  code: 'AUTO10',
  description: '10% off',
  scope: 'order',
  discountType: 'percentage',
  discountValue: 10,
  discountCents: 250,
  targetItemIds: [],
  minOrderCents: null,
  validFrom: '2026-01-01T00:00:00Z',
  validUntil: '2027-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetServiceClient.mockReturnValue({ from: vi.fn() })
})

describe('POST /api/promos/auto', () => {
  it('returns the applied promos', async () => {
    mockGetAutoAppliedPromos.mockResolvedValue([PROMO])

    const res = await POST(makeRequest({ subtotalCents: 2500, deliveryFeeCents: 0 }) as never)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ applied: [PROMO] })
  })

  it('keeps a 200 but flags a query failure', async () => {
    mockGetAutoAppliedPromos.mockRejectedValue(new MockAutoPromoQueryError())

    const res = await POST(makeRequest({ subtotalCents: 2500, deliveryFeeCents: 0 }) as never)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ applied: [], promosUnavailable: true })
  })

  it('returns 400 for a malformed body', async () => {
    const res = await POST(makeRequest({ subtotalCents: -1 }) as never)
    expect(res.status).toBe(400)
    expect(mockGetAutoAppliedPromos).not.toHaveBeenCalled()
  })
})
