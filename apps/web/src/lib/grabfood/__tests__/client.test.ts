import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// env.ts reads process.env at import; configure before importing the module.
process.env.GRABFOOD_ENABLED = 'true'
process.env.GRABFOOD_ENV = 'staging'
process.env.GRABFOOD_CLIENT_ID = 'test-client-id'
process.env.GRABFOOD_CLIENT_SECRET = 'test-client-secret'
process.env.GRABFOOD_WEBHOOK_SECRET = 'whsec-test'

const authModule = await import('@/lib/grabfood/auth')
const clientModule = await import('@/lib/grabfood/client')

function tokenResponse(token = 'tok', expiresIn = 604799): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), {
    status: 200,
  })
}

describe('GrabFood OAuth token request', () => {
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
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse('tok-1'))

    const first = await authModule.getAccessToken(fetchImpl)
    const second = await authModule.getAccessToken(fetchImpl)

    expect(first).toBe('tok-1')
    expect(second).toBe('tok-1')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('posts the documented JSON body with food.partner_api scope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(tokenResponse('tok-2', 3600))
    await authModule.getAccessToken(fetchImpl)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.grab.com/grabid/v1/oauth2/token')
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      client_id: 'test-client-id',
      client_secret: 'test-client-secret',
      grant_type: 'client_credentials',
      scope: 'food.partner_api',
    })
  })

  it('shares one in-flight request across concurrent callers', async () => {
    let resolveToken: ((value: Response) => void) | undefined
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveToken = resolve
        })
    )

    const first = authModule.getAccessToken(fetchImpl as unknown as typeof fetch)
    const second = authModule.getAccessToken(fetchImpl as unknown as typeof fetch)
    await Promise.resolve()
    resolveToken?.(tokenResponse('tok-shared'))

    await expect(Promise.all([first, second])).resolves.toEqual(['tok-shared', 'tok-shared'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws on a failed token request', async () => {
    authModule.clearGrabFoodTokenCache()
    const fetchImpl = vi.fn().mockResolvedValue(new Response('denied', { status: 400 }))
    await expect(authModule.getAccessToken(fetchImpl)).rejects.toThrow(/OAuth token request failed/)
  })
})

describe('GrabFoodClient request contracts', () => {
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

  function authThen(response: Response = new Response('{}', { status: 200 })): FetchMock {
    return vi
      .fn()
      .mockResolvedValueOnce(tokenResponse('tok', 3600))
      .mockResolvedValueOnce(response)
  }

  beforeEach(() => {
    authModule.clearGrabFoodTokenCache()
    process.env.GRABFOOD_ENV = 'staging'
  })

  it('acceptOrder sends toState', async () => {
    const fetchImpl = authThen()
    await makeClient(fetchImpl).acceptOrder('order-1')
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/order/prepare')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      orderID: 'order-1',
      toState: 'Accepted',
    })
  })

  it('markOrderReady sends markStatus', async () => {
    const fetchImpl = authThen()
    await makeClient(fetchImpl).markOrderReady('order-1')
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/orders/mark')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      orderID: 'order-1',
      markStatus: 1,
    })
  })

  it('cancelOrder sends merchantID + cancelCode', async () => {
    const fetchImpl = authThen()
    await makeClient(fetchImpl).cancelOrder('order-1', 'mch-1', 1003)
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/order/cancel')
    expect((init as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      orderID: 'order-1',
      merchantID: 'mch-1',
      cancelCode: 1003,
    })
  })

  it('updateReadyTime sends newOrderReadyTime', async () => {
    const fetchImpl = authThen()
    await makeClient(fetchImpl).updateReadyTime('order-1', '2026-10-11T12:30:00+08:00')
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/order/readytime')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      orderID: 'order-1',
      newOrderReadyTime: '2026-10-11T12:30:00+08:00',
    })
  })

  it('pauseStore sends isPause and optional duration', async () => {
    const fetchImpl = authThen()
    await makeClient(fetchImpl).pauseStore('mch-1', true, '1h')
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://partner-api.grab.com/grabfood-sandbox/partner/v1/merchant/pause')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      merchantID: 'mch-1',
      isPause: true,
      duration: '1h',
    })
  })

  it('listOrders uses merchantID + date + page', async () => {
    const fetchImpl = authThen(
      new Response(JSON.stringify({ more: false, orders: [] }), { status: 200 })
    )
    await makeClient(fetchImpl).listOrders({ merchantID: 'mch-1', date: '2026-11-01', page: 2 })
    const [url] = fetchImpl.mock.calls[1]
    expect(String(url)).toBe(
      'https://partner-api.grab.com/grabfood-sandbox/partner/v1/orders?merchantID=mch-1&date=2026-11-01&page=2'
    )
  })

  it('listAllOrders follows more until false', async () => {
    authModule.clearGrabFoodTokenCache()
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse('tok', 3600))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ more: true, orders: [{ orderID: 'a' }] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ more: false, orders: [{ orderID: 'b' }] }), { status: 200 })
      )

    const result = await makeClient(fetchImpl).listAllOrders('mch-1', '2026-11-01')

    expect(result.orders?.map((order) => order.orderID)).toEqual(['a', 'b'])
    const urls = fetchImpl.mock.calls.slice(1).map(([url]) => String(url))
    expect(urls[0]).toContain('page=0')
    expect(urls[1]).toContain('page=1')
  })

  it('notifyMenuUpdate posts the merchantID', async () => {
    const fetchImpl = authThen()
    await makeClient(fetchImpl).notifyMenuUpdate('mch-1')
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe(
      'https://partner-api.grab.com/grabfood-sandbox/partner/v1/merchant/menu/notification'
    )
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ merchantID: 'mch-1' })
  })

  it('createSelfServeJourney posts the partner outlet id', async () => {
    const fetchImpl = authThen(
      new Response(JSON.stringify({ activationUrl: 'https://grab.example/activate' }), {
        status: 200,
      })
    )
    const result = await makeClient(fetchImpl).createSelfServeJourney('Partner-ABECU')
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe(
      'https://partner-api.grab.com/grabfood-sandbox/partner/v1/self-serve/activation'
    )
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      partner: { merchantID: 'Partner-ABECU' },
    })
    expect(result.activationUrl).toBe('https://grab.example/activate')
  })

  it('retries once with a fresh token on 401', async () => {
    let tokenCount = 0
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const authHeader = (init?.headers as Record<string, string>)?.Authorization ?? ''
      if (authHeader.includes('Bearer fresh')) {
        return new Response('{}', { status: 200 })
      }
      if (authHeader.includes('Bearer tok')) {
        return new Response('expired', { status: 401 })
      }
      tokenCount += 1
      return tokenResponse(tokenCount === 1 ? 'tok' : 'fresh', 3600)
    })

    await makeClient(fetchImpl).markOrderReady('order-1')
    // token, order 401, fresh token, order retry
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('raises GrabFoodApiError with the path on failure', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse('tok', 3600))
      .mockResolvedValueOnce(new Response('nope', { status: 409 }))

    await expect(makeClient(fetchImpl).markOrderReady('order-1')).rejects.toMatchObject({
      name: 'GrabFoodApiError',
      status: 409,
      path: '/partner/v1/orders/mark',
    })
  })

  it('stays offline in mock mode', async () => {
    const fetchImpl = vi.fn()
    const client = new clientModule.GrabFoodClient({ environment: 'mock', fetchImpl })
    await expect(client.markOrderReady('order-1')).resolves.toBeUndefined()
    await expect(client.acceptOrder('order-1')).resolves.toBeUndefined()
    await expect(client.notifyMenuUpdate('mch-1')).resolves.toBeUndefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
