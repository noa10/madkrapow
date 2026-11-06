import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createSession: vi.fn(),
  updates: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/validators/env', () => ({
  env: { STRIPE_SECRET_KEY: 'test-only-key', NEXT_PUBLIC_URL: 'https://example.test' },
}))
vi.mock('@/lib/stripe/config', () => ({ getStripeConfigIssue: () => null }))
vi.mock('@/lib/admin/require-admin', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: mocks.createSession } }
  },
}))

import { POST } from '../route'

function request(amount: number) {
  return new Request('https://example.test/api/admin/orders/order-1/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve', approved_total_cents: amount }),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates = []
  const order = {
    id: 'order-1',
    customer_id: 'customer-1',
    order_kind: 'bulk',
    approval_status: 'pending_review',
    bulk_company_name: 'Example Co',
    bulk_requested_date: '2099-01-10T12:30:00Z',
  }
  const result = { data: null, error: null }
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: order, error: null }),
    update: (value: Record<string, unknown>) => {
      mocks.updates.push(value)
      return query
    },
    insert: () => query,
    then: (resolve: (value: typeof result) => void) => resolve(result),
  }
  mocks.requireAdmin.mockResolvedValue({
    user: { id: 'admin-1' },
    supabase: { from: () => query },
  })
  mocks.createSession.mockResolvedValue({ id: 'session-1', url: 'https://example.test/session' })
})

describe('bulk approval payment amount', () => {
  it('stores the approved cents and sends the same amount to Stripe', async () => {
    const response = await POST(request(1250), { params: Promise.resolve({ id: 'order-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.updates[0]).toMatchObject({ approved_total_cents: 1250, total_cents: 1250 })
    expect(mocks.createSession).toHaveBeenCalledOnce()
    expect(mocks.createSession.mock.calls[0][0]).toMatchObject({
      line_items: [{ price_data: { currency: 'myr', unit_amount: 1250 }, quantity: 1 }],
    })
  })

  it.each([0, -1, 12.5])('rejects %s cents without creating a payment session', async (amount) => {
    const response = await POST(request(amount), { params: Promise.resolve({ id: 'order-1' }) })

    expect(response.status).toBe(400)
    expect(mocks.updates).toHaveLength(0)
    expect(mocks.createSession).not.toHaveBeenCalled()
  })
})
