import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sessionMock = vi.fn<() => Promise<{ apiKey: string }>>(() => Promise.resolve({ apiKey: 'fresh-key' }))
const configuredMock = vi.fn<() => boolean>(() => true)
const baseUrlMock = vi.fn<() => string>(() => 'https://backend.test')

vi.mock('../auth', () => ({
  getHubboMerchantSession: sessionMock,
  isHubboMerchantConfigured: configuredMock,
  hubboMerchantBaseUrl: baseUrlMock,
}))

// The live /api/merchant/menu response is a FLAT envelope — payload at the top
// level (code + menu[]/categories[]), NOT wrapped in a `body` field.
const flatMenu = {
  code: '200',
  apiKey: null,
  message: null,
  merchant: { id: 3173 },
  menu: [{ id: 1, name: 'A', price: 14.5, grabfoodPrice: 19.3 }],
  categories: [{ id: 1, name: 'Set Krapow' }],
}

describe('HubboMerchantClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionMock.mockReset().mockResolvedValue({ apiKey: 'fresh-key' })
    configuredMock.mockReset().mockReturnValue(true)
    baseUrlMock.mockReset().mockReturnValue('https://backend.test')
    globalThis.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('getMenu() unwraps the FLAT envelope (returns menu/categories, not null)', async () => {
    const { createHubboMerchantClient } = await import('../client')
    const client = createHubboMerchantClient()

    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => flatMenu,
      text: async () => JSON.stringify(flatMenu),
    })

    const menu = await client.getMenu()
    // The critical assertion: flat envelope must be returned, not envelope.body (null)
    expect(menu).not.toBeNull()
    expect(menu.menu).toHaveLength(1)
    expect(menu.categories).toHaveLength(1)
    expect(menu.code).toBe('200')
  })

  it('throws when the envelope reports a non-200 code', async () => {
    const { createHubboMerchantClient, HubboMerchantApiError } = await import('../client')
    const client = createHubboMerchantClient()
    ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: '401', message: 'unauthorized' }),
      text: async () => JSON.stringify({ code: '401', message: 'unauthorized' }),
    })
    await expect(client.getMenu()).rejects.toThrow(HubboMerchantApiError)
  })

  it('returns a not-configured error when disabled', async () => {
    configuredMock.mockReturnValue(false)
    const { createHubboMerchantClient, HubboMerchantApiError } = await import('../client')
    const client = createHubboMerchantClient()
    await expect(client.getMenu()).rejects.toThrow(/not configured/i)
    await expect(client.getMenu()).rejects.toThrow(HubboMerchantApiError)
  })
})
