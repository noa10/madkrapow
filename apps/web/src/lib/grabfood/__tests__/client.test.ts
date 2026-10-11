import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'crypto'

// env.ts reads process.env at import; configure before importing the module.
process.env.GRABFOOD_ENABLED = 'true'
process.env.GRABFOOD_ENV = 'staging'
process.env.GRABFOOD_CLIENT_ID = 'test-client-id'
process.env.GRABFOOD_CLIENT_SECRET = 'test-client-secret'
process.env.GRABFOOD_WEBHOOK_SECRET = 'whsec-test'

const authModule = await import('@/lib/grabfood/auth')
const verifyModule = await import('@/lib/grabfood/verify')
const clientModule = await import('@/lib/grabfood/client')

describe('verifyWebhookSignature', () => {
  const body = '{"orderID":"TEST-1"}'
  const signature = createHmac('sha256', 'whsec-test').update(body, 'utf8').digest('hex')

  it('accepts a valid HMAC-SHA256 signature', () => {
    expect(verifyModule.verifyWebhookSignature(body, signature)).toBe(true)
  })

  it('accepts a sha256= prefixed signature', () => {
    expect(verifyModule.verifyWebhookSignature(body, `sha256=${signature}`)).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifyModule.verifyWebhookSignature('{"orderID":"EVIL"}', signature)).toBe(false)
  })

  it('rejects a missing or wrong signature', () => {
    expect(verifyModule.verifyWebhookSignature(body, null)).toBe(false)
    expect(verifyModule.verifyWebhookSignature(body, 'deadbeef')).toBe(false)
  })

  it('skips verification when disabled (mock mode)', async () => {
    process.env.GRABFOOD_ENV = 'mock'
    delete process.env.GRABFOOD_WEBHOOK_SECRET
    vi.resetModules()
    const fresh = await import('@/lib/grabfood/verify')
    expect(fresh.verifyWebhookSignature(body, null)).toBe(true)
  })
})

describe('GrabFood OAuth token cache', () => {
  beforeEach(() => {
    authModule.clearGrabFoodTokenCache()
    process.env.GRABFOOD_ENV = 'staging'
    process.env.GRABFOOD_CLIENT_ID = 'test-client-id'
    process.env.GRABFOOD_CLIENT_SECRET = 'test-client-secret'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches once and reuses the cached token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 604799 }), { status: 200 })
    )

    const first = await authModule.getAccessToken(fetchImpl)
    const second = await authModule.getAccessToken(fetchImpl)

    expect(first).toBe('tok-1')
    expect(second).toBe('tok-1')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('includes client_credentials grant and food.partner_api scope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'tok-2', expires_in: 3600 }), { status: 200 })
    )
    await authModule.getAccessToken(fetchImpl)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.grab.com/grabid/v1/oauth2/token')
    const bodyText = String((init as RequestInit).body)
    expect(bodyText).toContain('grant_type=client_credentials')
    expect(bodyText).toContain('scope=food.partner_api')
  })

  it('throws on a failed token request', async () => {
    authModule.clearGrabFoodTokenCache()
    const fetchImpl = vi.fn().mockResolvedValue(new Response('denied', { status: 400 }))
    await expect(authModule.getAccessToken(fetchImpl)).rejects.toThrow(/OAuth token request failed/)
  })
})

describe('GrabFoodClient', () => {
  it('returns synthetic responses in mock mode without network', async () => {
    const fetchImpl = vi.fn()
    const client = new clientModule.GrabFoodClient({ environment: 'mock', fetchImpl })

    // Mock methods resolve without touching the network (return type is void).
    await expect(client.markOrderReady('order-1')).resolves.toBeUndefined()
    await expect(client.acceptOrder('order-1')).resolves.toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends Bearer token and correct paths', async () => {
    authModule.clearGrabFoodTokenCache()
    process.env.GRABFOOD_CLIENT_ID = 'id'
    process.env.GRABFOOD_CLIENT_SECRET = 'secret'

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const client = new clientModule.GrabFoodClient({ environment: 'staging', fetchImpl })
    await client.markOrderReady('order-1')
    await client.cancelOrder('order-1', 'customer request')

    const [, readyInit] = fetchImpl.mock.calls[1]
    expect(fetchImpl.mock.calls[1][0]).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/orders/mark')
    expect((readyInit as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' })
    expect((readyInit as RequestInit).body).toContain('order-1')

    const [cancelUrl, cancelInit] = fetchImpl.mock.calls[2]
    expect(cancelUrl).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/order/cancel')
    expect((cancelInit as RequestInit).method).toBe('PUT')
  })

  it('retries once with a fresh token on 401', async () => {
    authModule.clearGrabFoodTokenCache()
    process.env.GRABFOOD_CLIENT_ID = 'id'
    process.env.GRABFOOD_CLIENT_SECRET = 'secret'

    let tokenCount = 0
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const authHeader = (init?.headers as Record<string, string>)?.Authorization ?? ''
      if (authHeader.includes('Bearer fresh')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      if (authHeader.includes('Bearer tok')) {
        return new Response('expired', { status: 401 })
      }
      tokenCount += 1
      return new Response(
        JSON.stringify({ access_token: tokenCount === 1 ? 'tok' : 'fresh', expires_in: 3600 }),
        { status: 200 }
      )
    })

    const client = new clientModule.GrabFoodClient({ environment: 'staging', fetchImpl })
    await client.markOrderReady('order-1')
    // token, order 401, fresh token, order retry
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('raises GrabFoodApiError with the path on failure', async () => {
    authModule.clearGrabFoodTokenCache()
    process.env.GRABFOOD_CLIENT_ID = 'id'
    process.env.GRABFOOD_CLIENT_SECRET = 'secret'

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response('nope', { status: 409 }))

    const client = new clientModule.GrabFoodClient({ environment: 'staging', fetchImpl })
    await expect(client.markOrderReady('order-1')).rejects.toMatchObject({
      name: 'GrabFoodApiError',
      status: 409,
      path: '/partner/v1/orders/mark',
    })
  })
})

describe('GrabFoodClient extended endpoints', () => {
  type FetchMock = ReturnType<typeof vi.fn>

  function makeClient(fetchImpl: FetchMock) {
    authModule.clearGrabFoodTokenCache()
    process.env.GRABFOOD_CLIENT_ID = 'id'
    process.env.GRABFOOD_CLIENT_SECRET = 'secret'
    return new clientModule.GrabFoodClient({
      environment: 'staging',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
  }

  function authThen(...responses: Response[]) {
    return vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(responses[0])
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
  }

  it('getMenuSyncTrace sends merchantID as a query param', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 })
      )
    const client = makeClient(fetchImpl)

    const trace = await client.getMenuSyncTrace('mch-1')

    expect(trace).toMatchObject({ status: 'COMPLETED' })
    const [url] = fetchImpl.mock.calls[1]
    expect(String(url)).toBe(
      'https://partner-api.grab.com/grabfood-sandbox/partner/v1/merchant/menu/trace?merchantID=mch-1'
    )
  })

  it('isOrderCancelable reads data.isCancelable', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { isCancelable: true } }), { status: 200 })
      )
    const client = makeClient(fetchImpl)

    const cancelable = await client.isOrderCancelable('order-1')

    expect(cancelable).toBe(true)
    const [url] = fetchImpl.mock.calls[1]
    expect(String(url)).toBe(
      'https://partner-api.grab.com/grabfood-sandbox/partner/v1/order/cancelable?orderID=order-1'
    )
  })

  it('isOrderCancelable defaults to false on unexpected shapes', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    const client = makeClient(fetchImpl)

    await expect(client.isOrderCancelable('order-1')).resolves.toBe(false)
  })

  it('updateReadyTime PUTs orderID + readyTime', async () => {
    const fetchImpl = authThen(new Response('{}', { status: 200 }))
    const client = makeClient(fetchImpl)

    await client.updateReadyTime('order-1', '2026-10-11T12:30:00+08:00')

    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/order/readytime')
    expect((init as RequestInit).method).toBe('PUT')
    expect((init as RequestInit).body).toContain('2026-10-11T12:30:00')
  })

  it('pauseStore PUTs merchantID + isPaused', async () => {
    const fetchImpl = authThen(new Response('{}', { status: 200 }))
    const client = makeClient(fetchImpl)

    await client.pauseStore('mch-1', true)

    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/merchant/pause')
    expect((init as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      merchantID: 'mch-1',
      isPaused: true,
    })
  })

  it('getStoreStatus encodes the merchant id in the path', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ isOpened: false, gasStatus: 'MERCHANT_PAUSED' }), {
          status: 200,
        })
      )
    const client = makeClient(fetchImpl)

    const status = await client.getStoreStatus('mch-1')

    expect(status).toMatchObject({ isOpened: false })
    const [url] = fetchImpl.mock.calls[1]
    expect(String(url)).toBe(
      'https://partner-api.grab.com/grabfood-sandbox/partner/v1/merchants/mch-1/store/status'
    )
  })

  it('extended endpoints stay offline in mock mode', async () => {
    const fetchImpl = vi.fn()
    const client = new clientModule.GrabFoodClient({ environment: 'mock', fetchImpl })

    await client.pauseStore('mch-1', true)
    await client.updateReadyTime('order-1', '2026-10-11T12:30:00+08:00')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
