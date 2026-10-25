import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  BILLPLZ_PRODUCTION_BASE_URL,
  BILLPLZ_SANDBOX_BASE_URL,
  BillplzApiError,
  BillplzNotConfiguredError,
  buildBillplzSignatureSource,
  computeBillplzSignature,
  createBill,
  getBill,
  getBillplzBaseUrl,
  isBillplzConfigured,
  normalizeBillplzMobile,
  verifyBillplzSignature,
} from '../client'

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    BILLPLZ_ENV: 'sandbox' as 'sandbox' | 'production',
    BILLPLZ_API_KEY: 'billplz-secret' as string | undefined,
    BILLPLZ_COLLECTION_ID: 'collection-1' as string | undefined,
    BILLPLZ_X_SIGNATURE_KEY: 'x-sig-key' as string | undefined,
    BILLPLZ_BASE_URL: undefined as string | undefined,
  },
}))

vi.mock('@/lib/validators/env', () => ({
  env: mockEnv,
}))

const fetchMock = vi.fn()

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnv.BILLPLZ_ENV = 'sandbox'
  mockEnv.BILLPLZ_API_KEY = 'billplz-secret'
  mockEnv.BILLPLZ_COLLECTION_ID = 'collection-1'
  mockEnv.BILLPLZ_X_SIGNATURE_KEY = 'x-sig-key'
  mockEnv.BILLPLZ_BASE_URL = undefined
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getBillplzBaseUrl', () => {
  it('uses the sandbox API by default', () => {
    expect(getBillplzBaseUrl()).toBe(BILLPLZ_SANDBOX_BASE_URL)
  })

  it('uses the production API when BILLPLZ_ENV=production', () => {
    mockEnv.BILLPLZ_ENV = 'production'
    expect(getBillplzBaseUrl()).toBe(BILLPLZ_PRODUCTION_BASE_URL)
  })

  it('honours an explicit base URL override and trims trailing slashes', () => {
    mockEnv.BILLPLZ_BASE_URL = 'https://proxy.example.com/api/v3/'
    expect(getBillplzBaseUrl()).toBe('https://proxy.example.com/api/v3')
  })
})

describe('isBillplzConfigured', () => {
  it('requires the API key, collection id, and X Signature key', () => {
    expect(isBillplzConfigured()).toBe(true)
    mockEnv.BILLPLZ_X_SIGNATURE_KEY = undefined
    expect(isBillplzConfigured()).toBe(false)
  })
})

describe('createBill', () => {
  const params = {
    email: 'diner@example.com',
    name: 'Diner',
    amountCents: 1250,
    description: 'Mad Krapow order MK123',
    callbackUrl: 'https://example.com/api/webhooks/billplz',
    redirectUrl: 'https://example.com/order/success?orderId=order-1',
    reference1: 'order-1',
    reference2: 'MK123',
  }

  it('posts an authenticated form-encoded bill and returns it', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: 'bill-1', url: 'https://billplz.test/bill-1', paid: false, amount: 1250 }),
    )

    const bill = await createBill(params)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BILLPLZ_SANDBOX_BASE_URL}/bills`)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('billplz-secret:').toString('base64')}`,
    )
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')

    const body = init.body as URLSearchParams
    expect(body.get('collection_id')).toBe('collection-1')
    expect(body.get('email')).toBe('diner@example.com')
    expect(body.get('amount')).toBe('1250')
    expect(body.get('callback_url')).toBe(params.callbackUrl)
    expect(body.get('redirect_url')).toBe(params.redirectUrl)
    expect(body.get('reference_1')).toBe('order-1')
    expect(body.get('reference_2')).toBe('MK123')

    expect(bill.id).toBe('bill-1')
    expect(bill.url).toBe('https://billplz.test/bill-1')
  })

  it('rejects non-integer or non-positive amounts before calling Billplz', async () => {
    await expect(createBill({ ...params, amountCents: 12.5 })).rejects.toThrow(
      'positive integer',
    )
    await expect(createBill({ ...params, amountCents: 0 })).rejects.toThrow(
      'positive integer',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires an email or mobile', async () => {
    await expect(
      createBill({ ...params, email: undefined, mobile: undefined }),
    ).rejects.toThrow('email or a mobile')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails loudly when credentials are missing', async () => {
    mockEnv.BILLPLZ_API_KEY = undefined

    await expect(createBill(params)).rejects.toBeInstanceOf(BillplzNotConfiguredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws a typed API error on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'nope' } }, 422))

    await expect(createBill(params)).rejects.toBeInstanceOf(BillplzApiError)
  })
})

describe('getBill', () => {
  it('fetches and URL-encodes the bill id', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: 'bill/1', paid: true, amount: 1250, paid_amount: 1250 }),
    )

    const bill = await getBill('bill/1')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe(`${BILLPLZ_SANDBOX_BASE_URL}/bills/bill%2F1`)
    expect(bill.paid).toBe(true)
  })
})

describe('Billplz X-Signature', () => {
  const callback = {
    id: 'bill-1',
    collection_id: 'collection-1',
    paid: 'true',
    state: 'paid',
    amount: '1250',
    paid_amount: '1250',
    due_at: '2026-10-24',
    email: 'diner@example.com',
    mobile: '',
    name: 'Diner',
    url: 'https://billplz.test/bill-1',
    paid_at: '2026-10-24 12:00:00 +0800',
    x_signature: 'ignored',
  }

  it('sorts keys, concatenates key+value, joins with pipes, and signs with HMAC-SHA256', () => {
    const source = buildBillplzSignatureSource(callback)

    expect(source).toBe(
      'amount1250|collection_idcollection-1|due_at2026-10-24|emaildiner@example.com|idbill-1|mobile|nameDiner|paidtrue|paid_amount1250|paid_at2026-10-24 12:00:00 +0800|statepaid|urlhttps://billplz.test/bill-1',
    )

    const expected = createHmac('sha256', 'x-sig-key').update(source).digest('hex')
    expect(computeBillplzSignature(callback, 'x-sig-key')).toBe(expected)
  })

  it('verifies a valid signature and rejects a tampered payload', () => {
    const signature = computeBillplzSignature(callback, 'x-sig-key')

    expect(verifyBillplzSignature(callback, signature)).toBe(true)
    expect(
      verifyBillplzSignature({ ...callback, amount: '1' }, signature),
    ).toBe(false)
  })

  it('rejects a signature of the wrong length without throwing', () => {
    expect(verifyBillplzSignature(callback, 'deadbeef')).toBe(false)
  })

  it('fails closed when the X Signature key is not configured', () => {
    mockEnv.BILLPLZ_X_SIGNATURE_KEY = undefined
    const signature = createHmac('sha256', 'x-sig-key').update(
      buildBillplzSignatureSource(callback),
    ).digest('hex')

    expect(verifyBillplzSignature(callback, signature)).toBe(false)
  })
})

describe('normalizeBillplzMobile', () => {
  it('strips punctuation and keeps a 60 country code', () => {
    expect(normalizeBillplzMobile('+60 12-345 6789')).toBe('60123456789')
  })

  it('converts a local leading zero to 60', () => {
    expect(normalizeBillplzMobile('012-345 6789')).toBe('60123456789')
  })

  it('returns undefined for unusable input or a landline', () => {
    expect(normalizeBillplzMobile('')).toBeUndefined()
    expect(normalizeBillplzMobile(null)).toBeUndefined()
    expect(normalizeBillplzMobile('123')).toBeUndefined()
    expect(normalizeBillplzMobile('03-1234 5678')).toBeUndefined()
  })
})
