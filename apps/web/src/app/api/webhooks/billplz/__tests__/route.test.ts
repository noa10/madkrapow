import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetBill,
  mockIsConfigured,
  mockVerify,
  mockFinalize,
  mockRecordPayment,
  mockCreateServerClient,
} = vi.hoisted(() => ({
  mockGetBill: vi.fn(),
  mockIsConfigured: vi.fn(),
  mockVerify: vi.fn(),
  mockFinalize: vi.fn(),
  mockRecordPayment: vi.fn(),
  mockCreateServerClient: vi.fn(),
}))

vi.mock('@/lib/billplz/client', () => ({
  getBill: (...args: unknown[]) => mockGetBill(...args),
  getBillplzCollectionId: () => 'collection-1',
  isBillplzConfigured: () => mockIsConfigured(),
  verifyBillplzSignature: (...args: unknown[]) => mockVerify(...args),
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

import { POST } from '../route'

function makeRequest(params: Record<string, string>): Request {
  return new Request('http://localhost/api/webhooks/billplz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
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
                maybeSingle: async () => ({ data: order, error: null }),
              }
            },
          }
        },
      }
    },
  }
}

const order = {
  id: 'order-1',
  status: 'pending',
  total_cents: 1250,
  billplz_bill_id: null as string | null,
}

const paidBill = {
  id: 'bill-1',
  collection_id: 'collection-1',
  paid: true,
  state: 'paid',
  amount: 1250,
  paid_amount: 1250,
  reference_1: 'order-1',
  reference_2: 'MK123',
  paid_at: '2026-10-24 12:00:00 +0800',
}

const callbackBody = {
  id: 'bill-1',
  paid: 'true',
  state: 'paid',
  amount: '1250',
  reference_1: 'order-1',
  x_signature: 'signature',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

  mockIsConfigured.mockReturnValue(true)
  mockVerify.mockReturnValue(true)
  mockGetBill.mockResolvedValue(paidBill)
  mockFinalize.mockResolvedValue({ outcome: 'advanced' })
  mockCreateServerClient.mockReturnValue(buildSupabase(order))
})

describe('POST /api/webhooks/billplz', () => {
  it('rejects an invalid X Signature before reading the bill', async () => {
    mockVerify.mockReturnValue(false)

    const res = await POST(makeRequest(callbackBody) as never)

    expect(res.status).toBe(401)
    expect(mockGetBill).not.toHaveBeenCalled()
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('does not finalise an unpaid bill', async () => {
    mockGetBill.mockResolvedValue({ ...paidBill, paid: false, state: 'due' })

    const res = await POST(makeRequest(callbackBody) as never)

    expect(res.status).toBe(200)
    expect(mockFinalize).not.toHaveBeenCalled()
    expect(mockRecordPayment).not.toHaveBeenCalled()
  })

  it('rejects a paid amount that does not match the server-calculated total', async () => {
    mockGetBill.mockResolvedValue({ ...paidBill, paid_amount: 1000 })

    const res = await POST(makeRequest(callbackBody) as never)

    expect(res.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('records the payment and finalises the order exactly once', async () => {
    mockFinalize.mockResolvedValue({ outcome: 'already_processed', status: 'preparing' })

    const res = await POST(makeRequest(callbackBody) as never)

    expect(res.status).toBe(200)
    expect(mockRecordPayment).toHaveBeenCalledWith(
      expect.anything(),
      'order-1',
      paidBill,
      1250,
    )
    expect(mockFinalize).toHaveBeenCalledWith(
      expect.anything(),
      'order-1',
      {
        paymentPatch: { billplz_bill_id: 'bill-1' },
        logLabel: 'Billplz Webhook',
      },
    )
  })

  it('rejects a bill from a different collection', async () => {
    mockGetBill.mockResolvedValue({ ...paidBill, collection_id: 'another-collection' })

    const res = await POST(makeRequest(callbackBody) as never)

    expect(res.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('rejects a bill bound to a different order', async () => {
    mockCreateServerClient.mockReturnValue(
      buildSupabase({ ...order, billplz_bill_id: 'another-bill' }),
    )

    const res = await POST(makeRequest(callbackBody) as never)

    expect(res.status).toBe(400)
    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('returns 404 when no order matches the bill', async () => {
    mockCreateServerClient.mockReturnValue(buildSupabase(null))

    const res = await POST(makeRequest(callbackBody) as never)

    expect(res.status).toBe(404)
    expect(mockFinalize).not.toHaveBeenCalled()
  })
})
