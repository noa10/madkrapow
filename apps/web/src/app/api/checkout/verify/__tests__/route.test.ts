import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetBill,
  mockIsConfigured,
  mockFinalize,
  mockRecordPayment,
  mockCreateServerClient,
  mockRetrieveSession,
} = vi.hoisted(() => ({
  mockGetBill: vi.fn(),
  mockIsConfigured: vi.fn(),
  mockFinalize: vi.fn(),
  mockRecordPayment: vi.fn(),
  mockCreateServerClient: vi.fn(),
  mockRetrieveSession: vi.fn(),
}))

vi.mock('@/lib/billplz/client', () => ({
  getBill: (...args: unknown[]) => mockGetBill(...args),
  getBillplzCollectionId: () => 'collection-1',
  isBillplzConfigured: () => mockIsConfigured(),
}))

vi.mock('@/lib/billplz/payments', () => ({
  recordBillplzPayment: (...args: unknown[]) => mockRecordPayment(...args),
}))

vi.mock('@/lib/services/order-payment', () => ({
  finalizePaidOrder: (...args: unknown[]) => mockFinalize(...args),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}))

vi.mock('@/lib/validators/env', () => ({
  env: { STRIPE_SECRET_KEY: 'sk_test_123' },
}))

vi.mock('stripe', () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        retrieve: (...args: unknown[]) => mockRetrieveSession(...args),
      },
    }
  },
}))

import { POST } from '../route'

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/checkout/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function buildSupabase(order: Record<string, unknown> | null) {
  return {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: unknown) {
              return {
                single: async () => ({ data: order, error: null }),
              }
            },
          }
        },
      }
    },
  }
}

const baseOrder = {
  id: 'order-1',
  status: 'pending',
  total_cents: 1250,
  billplz_bill_id: null as string | null,
  stripe_session_id: null as string | null,
}

const billplzOrder = { ...baseOrder, billplz_bill_id: 'bill-1' }
const stripeOrder = { ...baseOrder, stripe_session_id: 'cs_1' }

const paidBill = {
  id: 'bill-1',
  collection_id: 'collection-1',
  paid: true,
  amount: 1250,
  paid_amount: 1250,
  reference_1: 'order-1',
}

const paidSession = {
  id: 'cs_1',
  payment_status: 'paid',
  amount_total: 1250,
  currency: 'myr',
  payment_intent: 'pi_1',
  metadata: { order_id: 'order-1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  mockIsConfigured.mockReturnValue(true)
  mockGetBill.mockResolvedValue(paidBill)
  mockFinalize.mockResolvedValue({ outcome: 'advanced' })
  mockRetrieveSession.mockResolvedValue(paidSession)
  mockCreateServerClient.mockReturnValue(buildSupabase(baseOrder))
})

describe('POST /api/checkout/verify', () => {
  it('returns 404 when the order does not exist', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(null))

    const res = await POST(makeRequest({ orderId: 'missing' }) as never)

    expect(res.status).toBe(404)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('returns 400 when the order has no stored gateway reference', async () => {
    const res = await POST(makeRequest({ orderId: 'order-1' }) as never)

    expect(res.status).toBe(400)
    expect(mockGetBill).not.toHaveBeenCalled()
    expect(mockRetrieveSession).not.toHaveBeenCalled()
  })

  it('ignores a client-supplied bill id and reads the one stored on the order', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(billplzOrder))

    const res = await POST(
      makeRequest({ orderId: 'order-1', billId: 'attacker-bill', sessionId: 'cs_evil' }) as never,
    )

    expect(res.status).toBe(200)
    expect(mockGetBill).toHaveBeenCalledWith('bill-1')
    expect(mockRetrieveSession).not.toHaveBeenCalled()
  })

  it('rejects a bill whose reference points at another order', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(billplzOrder))
    mockGetBill.mockResolvedValue({ ...paidBill, reference_1: 'order-2' })

    const res = await POST(makeRequest({ orderId: 'order-1' }) as never)

    expect(res.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
    expect(mockRecordPayment).not.toHaveBeenCalled()
  })

  it('rejects a bill from a different collection', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(billplzOrder))
    mockGetBill.mockResolvedValue({ ...paidBill, collection_id: 'another-collection' })

    const res = await POST(makeRequest({ orderId: 'order-1' }) as never)

    expect(res.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('rejects a paid amount that does not match the order total', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(billplzOrder))
    mockGetBill.mockResolvedValue({ ...paidBill, paid_amount: 100 })

    const res = await POST(makeRequest({ orderId: 'order-1' }) as never)

    expect(res.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('finalises a paid Billplz order', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(billplzOrder))

    const res = await POST(makeRequest({ orderId: 'order-1' }) as never)

    expect(res.status).toBe(200)
    expect(mockRecordPayment).toHaveBeenCalledWith(expect.anything(), 'order-1', paidBill, 1250)
    expect(mockFinalize).toHaveBeenCalledWith(expect.anything(), 'order-1', {
      paymentPatch: { billplz_bill_id: 'bill-1' },
      logLabel: 'Verify',
    })
  })

  it('rejects a Stripe session whose metadata names another order', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(stripeOrder))
    mockRetrieveSession.mockResolvedValue({
      ...paidSession,
      metadata: { order_id: 'order-2' },
    })

    const res = await POST(makeRequest({ orderId: 'order-1' }) as never)

    expect(res.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('rejects a paid Stripe session whose amount differs from the order total', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(stripeOrder))
    mockRetrieveSession.mockResolvedValue({ ...paidSession, amount_total: 100 })

    const res = await POST(makeRequest({ orderId: 'order-1' }) as never)

    expect(res.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('finalises a paid Stripe order', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(stripeOrder))

    const res = await POST(makeRequest({ orderId: 'order-1' }) as never)

    expect(res.status).toBe(200)
    expect(mockRetrieveSession).toHaveBeenCalledWith('cs_1')
    expect(mockFinalize).toHaveBeenCalledWith(expect.anything(), 'order-1', {
      paymentPatch: {
        stripe_payment_intent_id: 'pi_1',
        stripe_session_id: 'cs_1',
      },
      logLabel: 'Verify',
    })
  })
})
