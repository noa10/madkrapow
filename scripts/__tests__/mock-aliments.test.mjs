/**
 * Guards the manual mock harness (scripts/mock-aliments.mjs) against contract
 * drift. The original harness served the menu wrapped in `body`, which the real
 * backend does NOT do — the drift went unnoticed until a live capture. These
 * assertions pin the flat wire format (flat envelope, numeric ids, RM-decimal
 * prices, subCategories linkage, epoch-ms snooze) so the manual dry-run path
 * cannot silently stop representing the real API again.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { MOCK_MENU, createMockAlimentsServer } from '../mock-aliments.mjs'

let server
let baseUrl = ''
let lastHeaders = {}

beforeAll(async () => {
  server = createMockAlimentsServer()
  server.on('request', (req) => {
    lastHeaders = req.headers
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('mock alimentsBackend harness', () => {
  it('serves the menu as a FLAT envelope (no `body` wrapper)', async () => {
    const res = await fetch(`${baseUrl}/api/merchant/menu`, {
      headers: { apiKey: 'dummy', 'X-Request-Id': 'req-1' },
    })
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.code).toBe('200')
    // The regression: payload must be top-level, never under `body`.
    expect(json.body).toBeUndefined()
    expect(Array.isArray(json.menu)).toBe(true)
    expect(Array.isArray(json.categories)).toBe(true)
    expect(json.menu.length).toBeGreaterThan(0)

    // Header echo proves the call reached the harness (not a proxy/cache).
    expect(lastHeaders.apikey).toBe('dummy')
    expect(lastHeaders['x-request-id']).toBe('req-1')
  })

  it('never logs the apiKey in clear text (CodeQL: clear-text logging)', async () => {
    const logged = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => logged.push(args.join(' ')))
    try {
      await fetch(`${baseUrl}/api/merchant/menu`, {
        headers: { apiKey: 'super-secret-credential-value', 'X-Request-Id': 'req-2' },
      })
    } finally {
      spy.mockRestore()
    }

    const output = logged.join('\n')
    // Identity stays visible for debugging, but the credential must not.
    expect(output).not.toContain('super-secret-credential-value')
    expect(output).toContain('supe…alue')
    expect(output).toContain('X-Request-Id=req-2')
  })

  it('exposes a menu whose shape matches the live wire format', async () => {
    const res = await fetch(`${baseUrl}/api/merchant/menu`)
    const json = await res.json()

    for (const category of json.categories) {
      expect(typeof category.id).toBe('number')
      expect(category.name).toBeTruthy()
    }

    const categoryIds = new Set(json.categories.map((c) => c.id))
    for (const item of json.menu) {
      expect(typeof item.id).toBe('number')
      expect(item.name).toBeTruthy()
      // Item->category linkage is subCategories[0].id on live payloads.
      expect(categoryIds.has(item.subCategories?.[0]?.id)).toBe(true)
      // Prices are RM decimals, so a realistic price is a small number
      // (14.5). A sen-style integer (1450) would be a 100x bug.
      if (typeof item.price === 'number') expect(item.price).toBeLessThan(1000)
    }

    // The harness must keep exercising every documented mapping branch.
    const prices = json.menu.map((i) => i.price)
    expect(prices.some((p) => typeof p !== 'number')).toBe(true) // priceInTwoDecimal fallback
    expect(json.menu.some((i) => i.grabfoodPrice > 0)).toBe(true) // GrabFood override
    expect(json.menu.some((i) => i.grabfoodPrice === 0)).toBe(true) // not on GrabFood -> null
    expect(json.menu.some((i) => Number(i.snoozeTill) > Date.now())).toBe(true) // snoozed
  })

  it('uses epoch-MILLISECOND snoozeTill, matching the live payload', () => {
    const snoozed = MOCK_MENU.menu.filter((i) => i.snoozeTill != null)
    expect(snoozed.length).toBeGreaterThan(0)
    for (const item of snoozed) {
      // Milliseconds since epoch is ~1e12+; seconds would be ~1e9.
      expect(item.snoozeTill).toBeGreaterThan(1e12)
    }
  })

  it('keeps the login endpoint `body`-wrapped (it genuinely is)', async () => {
    const res = await fetch(`${baseUrl}/api/merchant/login`, { method: 'POST' })
    const json = await res.json()
    expect(json.code).toBe('200')
    expect(json.body).toEqual({ apiKey: 'mock-login-apiKey' })
  })
})
