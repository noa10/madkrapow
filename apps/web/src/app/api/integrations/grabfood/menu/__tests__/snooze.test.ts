import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Deterministic clock: 2026-10-11 10:00 MYT. Same-day snoozes must map to
// UNAVAILABLETODAY regardless of when the test runs.
const FIXED_NOW = new Date('2026-10-11T02:00:00Z')
vi.useFakeTimers({ now: FIXED_NOW })

// Controllable env mock: the real env.ts falls back to raw process.env strings
// when validation fails (test env lacks NEXT_PUBLIC_* vars), where 'false' is
// truthy and the disabled guard cannot be exercised faithfully.
const envMock = vi.hoisted(() => ({
  GRABFOOD_ENABLED: true,
  GRABFOOD_ENV: 'mock',
  GRABFOOD_MERCHANT_ID: 'mch-1',
}))
vi.mock('@/lib/validators/env', () => ({ env: envMock }))

const serviceClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => serviceClientMock(),
}))

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
}))

// env mock configured above before importing the route.
const { POST, DELETE } = await import('../snooze/route')

const MAPPED_ROW = {
  id: 'cp-1',
  external_item_id: 'grab-item-1',
  external_name: 'Nasi Lemak',
  price_cents: null,
  is_available: true,
  snooze_till: null,
  menu_items: [
    {
      id: 'mi-1',
      name: 'Nasi Lemak',
      price_cents: 1250,
      is_available: true,
      snooze_till: null,
    },
  ],
}

function buildMockClient(opts: { row?: unknown; updateError?: { message: string } | null } = {}) {
  const updates: Array<{ table: string; patch: unknown }> = []
  return {
    updates,
    from(table: string) {
      const builder = {
        select(_cols?: string) {
          return builder
        },
        eq(_col: string, _val: unknown) {
          return builder
        },
        update(patch: unknown) {
          updates.push({ table, patch })
          return builder
        },
        maybeSingle: async () => ({ data: opts.row ?? null, error: null }),
        then(resolve: (v: { data: null; error: unknown }) => void) {
          resolve({ data: null, error: opts.updateError ?? null })
        },
      }
      return builder
    },
  }
}

type NextRequestLike = Parameters<typeof POST>[0]

function makePostRequest(body: unknown): NextRequestLike {
  return new Request('http://localhost/api/integrations/grabfood/menu/snooze', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as NextRequestLike
}

function makeDeleteRequest(query = ''): NextRequestLike {
  return new Request(`http://localhost/api/integrations/grabfood/menu/snooze${query}`, {
    method: 'DELETE',
  }) as unknown as NextRequestLike
}

beforeEach(() => {
  requireRoleMock.mockResolvedValue({ user: { id: 'u1' } })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('snooze route', () => {
  it('sets snooze_till and pushes UNAVAILABLETODAY for a same-day snooze', async () => {
    const client = buildMockClient({ row: MAPPED_ROW })
    serviceClientMock.mockReturnValue(client)

    const res = await POST(makePostRequest({ menuItemId: '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d', durationMinutes: 30 }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(client.updates).toEqual([
      {
        table: 'channel_products',
        patch: { snooze_till: '2026-10-11T02:30:00.000Z' },
      },
    ])
    expect(json).toMatchObject({
      ok: true,
      available_status: 'UNAVAILABLETODAY',
      pushed: { id: 'grab-item-1', availableStatus: 'UNAVAILABLETODAY' },
    })
  })

  it('returns pushed:false for an item without a GrabFood external id', async () => {
    const client = buildMockClient({
      row: {
        ...MAPPED_ROW,
        external_item_id: null,
      },
    })
    serviceClientMock.mockReturnValue(client)

    const res = await POST(makePostRequest({ menuItemId: '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d', durationMinutes: 60 }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.pushed).toBeNull()
    expect(json.warning).toContain('not mapped')
  })

  it('404s when no channel mapping exists', async () => {
    serviceClientMock.mockReturnValue(buildMockClient({ row: null }))

    const res = await POST(makePostRequest({ menuItemId: '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d', durationMinutes: 30 }))

    expect(res.status).toBe(404)
  })

  it('400s on invalid payloads', async () => {
    const res = await POST(makePostRequest({ menuItemId: 'not-a-uuid', durationMinutes: 30 }))
    expect(res.status).toBe(400)

    const res2 = await POST(makePostRequest({ menuItemId: '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d', durationMinutes: 9999 }))
    expect(res2.status).toBe(400)
  })

  it('rejects when the integration is disabled', async () => {
    envMock.GRABFOOD_ENABLED = false
    envMock.GRABFOOD_ENV = 'production'
    const res = await POST(
      makePostRequest({ menuItemId: '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d', durationMinutes: 30 })
    )
    expect(res.status).toBe(409)
    envMock.GRABFOOD_ENABLED = true
    envMock.GRABFOOD_ENV = 'mock'
  })
})

describe('snooze restore (DELETE)', () => {
  it('clears snooze_till and pushes AVAILABLE', async () => {
    const client = buildMockClient({ row: { ...MAPPED_ROW, snooze_till: '2026-10-11T12:00:00Z' } })
    serviceClientMock.mockReturnValue(client)

    const res = await DELETE(
      makeDeleteRequest('?menuItemId=5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d')
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(client.updates).toEqual([
      { table: 'channel_products', patch: { snooze_till: null } },
    ])
    expect(json).toMatchObject({
      ok: true,
      available_status: 'AVAILABLE',
      pushed: { id: 'grab-item-1', availableStatus: 'AVAILABLE' },
    })
  })

  it('400s on a missing or non-UUID menuItemId', async () => {
    const res = await DELETE(makeDeleteRequest())
    expect(res.status).toBe(400)
  })
})
