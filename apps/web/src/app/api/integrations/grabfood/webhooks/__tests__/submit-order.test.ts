import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.GRABFOOD_ENV = 'mock'
  delete process.env.GRABFOOD_ENABLED
  delete process.env.GRABFOOD_PARTNER_CLIENT_ID
  delete process.env.GRABFOOD_PARTNER_CLIENT_SECRET
  delete process.env.GRABFOOD_MERCHANT_ID
})

const handlerMock = vi.hoisted(() => ({
  handleSubmitOrder: vi.fn(),
}))
vi.mock('../handlers', () => handlerMock)

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => ({}),
}))

import { POST } from '../submit-order/route'

const VALID_PAYLOAD = {
  orderID: '91646057-CYUWL64UGF5XVA',
  shortOrderNumber: 'GF-659',
  merchantID: '1-C36JLBD2PFD3LA',
  paymentType: 'CASHLESS',
  cutlery: false,
  orderTime: '2026-09-28T08:19:00+00:00',
  featureFlags: { orderAcceptedType: 'AUTO', orderType: 'DeliveredByGrab' },
  items: [{ id: 'GF-ITEM-1', quantity: 1, price: 1300 }],
  price: { subtotal: 1300, merchantFundPromo: 0 },
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/integrations/grabfood/webhooks/submit-order', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

describe('POST submit-order route', () => {
  beforeEach(() => {
    handlerMock.handleSubmitOrder.mockReset()
  })

  it('acks 200 after a successful POS import', async () => {
    handlerMock.handleSubmitOrder.mockResolvedValue({
      status: 'created',
      order_number: 'MKTEST1',
    })

    const res = await POST(makeRequest(VALID_PAYLOAD) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, status: 'created', order_number: 'MKTEST1' })
    expect(handlerMock.handleSubmitOrder).toHaveBeenCalledOnce()
  })

  it('returns 500 for unmapped/error so Grab retries', async () => {
    handlerMock.handleSubmitOrder.mockResolvedValue({ status: 'unmapped', detail: 'GF-ITEM-X' })
    expect((await POST(makeRequest(VALID_PAYLOAD) as never)).status).toBe(500)

    handlerMock.handleSubmitOrder.mockResolvedValue({ status: 'error', detail: 'db down' })
    expect((await POST(makeRequest(VALID_PAYLOAD) as never)).status).toBe(500)
  })

  it('returns 503 while the same delivery is in flight', async () => {
    handlerMock.handleSubmitOrder.mockResolvedValue({ status: 'busy' })
    expect((await POST(makeRequest(VALID_PAYLOAD) as never)).status).toBe(503)
  })

  it('rejects missing orderID/merchantID with 400 before touching the handler', async () => {
    expect((await POST(makeRequest({ merchantID: 'm' }) as never)).status).toBe(400)
    expect((await POST(makeRequest({ orderID: 'o' }) as never)).status).toBe(400)
    expect(handlerMock.handleSubmitOrder).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON with 400', async () => {
    expect((await POST(makeRequest('not-json') as never)).status).toBe(400)
  })
})
