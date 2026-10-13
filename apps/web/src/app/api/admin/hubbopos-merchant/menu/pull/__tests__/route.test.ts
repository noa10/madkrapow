import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { SupabaseClient } from '@supabase/supabase-js'

// Controllable env mock. A dummy API_KEY makes the REAL HubboMerchantClient
// configured (auth.ts reads it, not HUBBO_MERCHANT_ENABLED), so with BASE_URL
// pointed at the local mock server the whole chain — real client, real fetch,
// real {code:"200", body} envelope unwrap — runs for real. No Supabase needed:
// the route reaches the service client only for non-dry-run writes, and the
// happy path here is a dry run.
const envMock = vi.hoisted(() => ({
  HUBBO_MERCHANT_ENABLED: true as boolean,
  HUBBO_MERCHANT_API_KEY: 'test-captured-api-key' as string | undefined,
  HUBBO_MERCHANT_BASE_URL: 'http://127.0.0.1:0' as string,
}))
vi.mock('@/lib/validators/env', () => ({ env: envMock }))

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
}))

const getServiceClientMock = vi.fn(() => ({
  from: () => {
    throw new Error('dry run must not touch the database')
  },
}) as unknown as SupabaseClient)
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => getServiceClientMock(),
}))

const { POST } = await import('../route')

// ── Local mock alimentsBackend: serves GET /api/merchant/menu and records the
// exact request so we can assert the client sends the captured apiKey header.
let server: Server
let baseUrl = ''
let lastHeaders: Record<string, string | string[] | undefined> = {}

beforeAll(async () => {
  server = createServer((req, res) => {
    lastHeaders = req.headers
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      // FLAT envelope matching the live /api/merchant/menu shape (proven via a
      // real capture): payload at the top level (menu[]/categories[]), RM-decimal
      // prices, item->category linkage via subCategories[0].id.
      JSON.stringify({
        code: '200',
        message: 'success',
        categories: [{ id: 'cat-1', name: 'Rice Dishes' }],
        menu: [
          { id: 'item-1', name: 'Nasi Lemak', price: 12.5, grabfoodPrice: 13.0, sku: 'GF-NL-1', subCategories: [{ id: 'cat-1' }] },
          { id: 'item-2', name: 'Teh Ais', price: 3.5, subCategories: [{ id: 'cat-1' }] },
          { id: 'item-3', name: 'Broken', subCategories: [{ id: 'cat-1' }] }, // no price -> skipped warning
        ],
      })
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
  envMock.HUBBO_MERCHANT_BASE_URL = baseUrl
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  envMock.HUBBO_MERCHANT_ENABLED = true
  requireRoleMock.mockResolvedValue({ user: { id: 'u1' } })
})

function req(body?: unknown) {
  return {
    method: 'POST',
    headers: { get: (_: string) => null },
    json: async () => (body ?? {}),
  } as never
}

describe('POST /api/admin/hubbopos-merchant/menu/pull', () => {
  it('401s when the user is not an admin/manager', async () => {
    requireRoleMock.mockResolvedValue({ error: { status: 401 } })
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(getServiceClientMock).not.toHaveBeenCalled()
  })

  it('409s when the adapter is disabled (env-gated, default off)', async () => {
    envMock.HUBBO_MERCHANT_ENABLED = false
    const res = await POST(req())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain('HUBBO_MERCHANT_ENABLED=false')
  })

  it('400s on an invalid body (dryRun not a boolean)', async () => {
    const res = await POST(req({ dryRun: 'yes' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid pull request')
  })

  it('dry run fetches via the real client + unwraps the envelope and writes nothing', async () => {
    const res = await POST(req({ dryRun: true }))
    expect(res.status).toBe(200)

    // The real HubboMerchantClient sent the captured apiKey as a header.
    expect(String(lastHeaders.apikey)).toBe('test-captured-api-key')
    expect(lastHeaders['x-request-id']).toBeTruthy()

    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.dryRun).toBe(true)
    // dry run writes nothing (the service client's .from() would throw if hit)
    expect(json.categoriesUpserted).toBe(0)
    expect(json.itemsUpserted).toBe(0)
    // mapping ran over the unwrapped body
    expect(json.warnings.join(' ')).toContain('Broken') // no parsable price -> skipped
  })

  it('502s when the upstream pull throws (e.g. apiKey not configured / upstream error)', async () => {
    const restore = envMock.HUBBO_MERCHANT_API_KEY
    envMock.HUBBO_MERCHANT_API_KEY = undefined // real client now "not configured"
    try {
      const res = await POST(req({ dryRun: true }))
      expect(res.status).toBe(502)
      const json = await res.json()
      expect(json.error).toBe('Menu pull failed')
    } finally {
      envMock.HUBBO_MERCHANT_API_KEY = restore
    }
  })
})
