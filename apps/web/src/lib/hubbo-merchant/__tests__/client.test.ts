import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Controllable env mock (the real env.ts falls back to raw strings when
// validation fails in tests, which cannot express disabled state).
const envMock = vi.hoisted(() => ({
  HUBBO_MERCHANT_ENABLED: true,
  HUBBO_MERCHANT_BASE_URL: 'https://aliments.test/alimentsBackend',
  HUBBO_MERCHANT_ANDROID_ID: 'android-1' as string | undefined,
  HUBBO_MERCHANT_DEVICE_ID: 'device-1' as string | undefined,
  HUBBO_MERCHANT_API_KEY: undefined as string | undefined,
}))
vi.mock('@/lib/validators/env', () => ({ env: envMock }))

const authModule = await import('@/lib/hubbo-merchant/auth')
const clientModule = await import('@/lib/hubbo-merchant/client')

function loginResponse(ok = true, apiKey?: string) {
  const body = apiKey === undefined ? {} : { apiKey }
  return new Response(
    JSON.stringify(ok ? { code: '200', body } : { code: '401', message: 'bad device' }),
    { status: ok ? 200 : 401 }
  )
}

beforeEach(() => {
  authModule.clearHubboMerchantSession()
  envMock.HUBBO_MERCHANT_ANDROID_ID = 'android-1'
  envMock.HUBBO_MERCHANT_DEVICE_ID = 'device-1'
  envMock.HUBBO_MERCHANT_API_KEY = undefined
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Hubbo merchant auth', () => {
  it('uses the captured HUBBO_MERCHANT_API_KEY without any login call', async () => {
    envMock.HUBBO_MERCHANT_API_KEY = 'captured-key'
    const fetchImpl = vi.fn()

    const session = await authModule.getHubboMerchantSession(fetchImpl)

    expect(session.apiKey).toBe('captured-key')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('logs in with androidId/deviceId and caches the minted key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(loginResponse(true, 'minted-key'))

    const first = await authModule.getHubboMerchantSession(fetchImpl)
    const second = await authModule.getHubboMerchantSession(fetchImpl)

    expect(first.apiKey).toBe('minted-key')
    expect(second.apiKey).toBe('minted-key')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://aliments.test/alimentsBackend/api/merchant/login')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      androidId: 'android-1',
      deviceId: 'device-1',
    })
  })

  it('throws when neither a captured key nor device identity is configured', async () => {
    envMock.HUBBO_MERCHANT_ANDROID_ID = undefined
    envMock.HUBBO_MERCHANT_DEVICE_ID = undefined

    await expect(authModule.getHubboMerchantSession(vi.fn())).rejects.toThrow(
      /not configured/
    )
  })

  it('throws when login fails or returns no apiKey', async () => {
    const fetchHttpFail = vi.fn().mockResolvedValue(new Response('nope', { status: 403 }))
    await expect(authModule.getHubboMerchantSession(fetchHttpFail)).rejects.toThrow(
      /login failed \(403\)/
    )

    authModule.clearHubboMerchantSession()
    const fetchNoKey = vi.fn().mockResolvedValue(loginResponse(true, undefined))
    await expect(authModule.getHubboMerchantSession(fetchNoKey)).rejects.toThrow(/no apiKey/)
  })
})

describe('HubboMerchantClient', () => {
  it('sends apiKey + X-Request-Id headers and unwraps the envelope body', async () => {
    envMock.HUBBO_MERCHANT_API_KEY = 'captured-key'
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ code: '200', body: { categories: [{ id: 'c1', name: 'Rice' }] } }),
        { status: 200 }
      )
    )
    const client = new clientModule.HubboMerchantClient({ fetchImpl })

    const menu = await client.getMenu()

    expect(menu.categories).toEqual([{ id: 'c1', name: 'Rice' }])
    const [, init] = fetchImpl.mock.calls[0]
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.apiKey).toBe('captured-key')
    expect(headers['X-Request-Id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(String(init?.body ?? '')).toBe('')
  })

  it('raises on non-200 envelope codes and HTTP failures', async () => {
    envMock.HUBBO_MERCHANT_API_KEY = 'captured-key'

    const envelopeFail = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: '500', message: 'boom' }), { status: 200 })
    )
    const client1 = new clientModule.HubboMerchantClient({ fetchImpl: envelopeFail })
    await expect(client1.getMenu()).rejects.toMatchObject({
      name: 'HubboMerchantApiError',
      status: 200,
      path: '/api/merchant/menu',
    })

    const httpFail = vi.fn().mockResolvedValue(new Response('gone', { status: 404 }))
    const client2 = new clientModule.HubboMerchantClient({ fetchImpl: httpFail })
    await expect(client2.getMenu()).rejects.toMatchObject({ status: 404 })
  })

  it('throws a configuration error before any network call when unconfigured', async () => {
    envMock.HUBBO_MERCHANT_ANDROID_ID = undefined
    envMock.HUBBO_MERCHANT_DEVICE_ID = undefined
    envMock.HUBBO_MERCHANT_API_KEY = undefined
    const fetchImpl = vi.fn()
    const client = new clientModule.HubboMerchantClient({ fetchImpl })

    await expect(client.getMenu()).rejects.toThrow(/not configured/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
