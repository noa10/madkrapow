import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockBillplzAvailable, mockStripeAvailable } = vi.hoisted(() => ({
  mockBillplzAvailable: vi.fn(),
  mockStripeAvailable: vi.fn(),
}))

vi.mock('@/lib/billplz/client', () => ({
  isBillplzAvailable: () => mockBillplzAvailable(),
}))

vi.mock('@/lib/stripe/config', () => ({
  isStripeAvailable: () => mockStripeAvailable(),
}))

import { GET } from '../route'

async function methods() {
  const response = await GET()
  const body = await response.json()
  return body.methods.map((method: { id: string }) => method.id)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBillplzAvailable.mockReturnValue(true)
  mockStripeAvailable.mockReturnValue(true)
})

describe('GET /api/payments/methods', () => {
  it('offers Stripe and Billplz when both are available', async () => {
    expect(await methods()).toEqual(['stripe', 'billplz'])
  })

  it('hides Billplz while it is disabled or incomplete', async () => {
    mockBillplzAvailable.mockReturnValue(false)

    expect(await methods()).toEqual(['stripe'])
  })

  it('hides Stripe while its keys are test-mode or mismatched', async () => {
    mockStripeAvailable.mockReturnValue(false)

    expect(await methods()).toEqual(['billplz'])
  })

  it('returns no methods when neither gateway is available', async () => {
    mockBillplzAvailable.mockReturnValue(false)
    mockStripeAvailable.mockReturnValue(false)

    expect(await methods()).toEqual([])
  })
})
