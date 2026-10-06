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
