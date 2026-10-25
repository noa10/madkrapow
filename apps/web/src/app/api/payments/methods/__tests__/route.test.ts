import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockConfigured, mockEnv } = vi.hoisted(() => ({
  mockConfigured: vi.fn(),
  mockEnv: { BILLPLZ_ENABLED: true },
}))

vi.mock('@/lib/billplz/client', () => ({
  isBillplzConfigured: () => mockConfigured(),
}))

vi.mock('@/lib/validators/env', () => ({
  env: mockEnv,
}))

import { GET } from '../route'

async function methods() {
  const response = await GET()
  const body = await response.json()
  return body.methods.map((method: { id: string }) => method.id)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnv.BILLPLZ_ENABLED = true
})

describe('GET /api/payments/methods', () => {
  it('offers Stripe and Billplz when Billplz is enabled and configured', async () => {
    mockConfigured.mockReturnValue(true)

    expect(await methods()).toEqual(['stripe', 'billplz'])
  })

  it('hides Billplz while it is disabled', async () => {
    mockEnv.BILLPLZ_ENABLED = false
    mockConfigured.mockReturnValue(true)

    expect(await methods()).toEqual(['stripe'])
  })

  it('hides Billplz when its credentials are incomplete', async () => {
    mockConfigured.mockReturnValue(false)

    expect(await methods()).toEqual(['stripe'])
  })
})
