import { describe, it, expect, vi, beforeEach } from 'vitest'

const envMock = vi.hoisted(() => ({
  PRINT_BRIDGE_SECRET: 'bridge-secret' as string | undefined,
  STORE_ADDRESS: '123 Thai Food Street, Shah Alam',
  STORE_PHONE: '+60123456789',
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

const { GET: claimGET } = await import('../../jobs/claim/route')
const { POST: renderPOST } = await import('../../jobs/render/route')

const ORDER_ID = '6a1b2c3d-4e5f-4a1b-8c2d-3e4f5a6b7c8d'

const ORDER_ROW = {
  id: ORDER_ID,
  order_number: 'MKTEST1',
  source: 'counter',
  status: 'paid',
  created_at: new Date(Date.now() - 60_000).toISOString(),
  customer_name: null,
  subtotal_cents: 1250,
  total_cents: 1250,
  notes: null,
  delivery_type: 'self_pickup',
}

const ITEM_ROW = {
  id: 'oi-1',
  menu_item_name: 'Nasi Lemak',
  menu_item_price_cents: 1250,
  quantity: 1,
  line_total_cents: 1250,
  notes: null,
}

interface Opts {
  orders?: unknown[]
  printedMarkerExists?: boolean
  orderRow?: unknown
}

function buildMockClient(opts: Opts = {}) {
  const insertedMarkers: unknown[] = []
  return {
    insertedMarkers,
    from(table: string) {
      const builder = {
        select(_cols?: string) {
          return builder
        },
        eq(_col: string, _val: unknown) {
          return builder
        },
        in(_col: string, _vals: unknown[]) {
          return builder
        },
        gte(_col: string, _val: unknown) {
          return builder
        },
        order(_col: string, _opts?: unknown) {
          return builder
        },
        limit(_n: number) {
          return builder
        },
        insert(payload: unknown) {
          insertedMarkers.push(payload)
          return {
            select: () => ({ single: async () => ({ data: { id: 'evt-1' }, error: null }) }),
          }
        },
        maybeSingle: async () => ({
          data: table === 'orders' ? (opts.orderRow ?? null) : null,
          error: null,
        }),
        then(resolve: (v: { data: unknown; error: null }) => void) {
          if (table === 'orders') resolve({ data: opts.orders ?? [], error: null })
          else if (table === 'order_items') resolve({ data: [ITEM_ROW], error: null })
          else if (table === 'order_item_modifiers') resolve({ data: [], error: null })
          else if (table === 'payments') resolve({ data: { method: 'cash' }, error: null })
          else if (table === 'order_events')
            resolve({ data: opts.printedMarkerExists ? [{ id: 'evt-0' }] : [], error: null })
          else resolve({ data: null, error: null })
        },
      }
      return builder
    },
  }
}

function bridgeRequest(url: string): Request {
  return new Request(url, {
    headers: { authorization: `Bearer ${envMock.PRINT_BRIDGE_SECRET}` },
  }) as unknown as Request
}

beforeEach(() => {
  envMock.PRINT_BRIDGE_SECRET = 'bridge-secret'
})

describe('GET /api/print/jobs/claim', () => {
  it('returns jobs with ESC/POS bytes and claims them with printed markers', async () => {
    const client = buildMockClient({ orders: [ORDER_ROW], orderRow: ORDER_ROW })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    // Counter order: kitchen docket + receipt.
    expect(json.jobs.map((j: { type: string }) => j.type).sort()).toEqual([
      'kitchen_docket',
      'receipt',
    ])
    for (const job of json.jobs) {
      expect(job.bytes).toEqual(expect.any(String))
      // Base64 decodes and starts with ESC @.
      expect(Array.from(Buffer.from(job.bytes, 'base64')).slice(0, 2)).toEqual([0x1b, 0x40])
    }
    expect(client.insertedMarkers).toHaveLength(2)
    expect(client.insertedMarkers.map((m) => (m as { event_type: string }).event_type).sort()).toEqual([
      'printed_kitchen_docket',
      'printed_receipt',
    ])
  })

  it('does not re-claim orders that already have printed markers', async () => {
    const client = buildMockClient({ orders: [ORDER_ROW], printedMarkerExists: true })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()

    expect(json.jobs).toHaveLength(0)
    expect(client.insertedMarkers).toHaveLength(0)
  })

  it('rejects a wrong bridge secret with 401', async () => {
    const res = await claimGET(
      new Request('http://localhost/api/print/jobs/claim', {
        headers: { authorization: 'Bearer wrong' },
      }) as never
    )
    expect(res.status).toBe(401)
  })

  it('fails closed in production when no secret is configured', async () => {
    envMock.PRINT_BRIDGE_SECRET = undefined
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const res = await claimGET(new Request('http://localhost/api/print/jobs/claim') as never)
      expect(res.status).toBe(503)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('POST /api/print/jobs/render', () => {
  const body = { order_id: ORDER_ID, type: 'receipt', reprint: true }

  it('renders bytes for staff reprints with a REPRINT watermark', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'u1' } })
    const client = buildMockClient({ orderRow: ORDER_ROW })
    serviceClientMock.mockReturnValue(client)

    const res = await renderPOST(
      new Request('http://localhost/api/print/jobs/render', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }) as never
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.order_number).toBe('MKTEST1')
    expect(json.reprint).toBe(true)
    const text = Buffer.from(json.bytes, 'base64').toString('latin1')
    expect(text).toContain('** REPRINT **')
    expect(text).toContain('Nasi Lemak')
  })

  it('404s for unknown orders', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'u1' } })
    serviceClientMock.mockReturnValue(buildMockClient({}))

    const res = await renderPOST(
      new Request('http://localhost/api/print/jobs/render', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }) as never
    )
    expect(res.status).toBe(404)
  })

  it('accepts the bridge secret in place of a staff session', async () => {
    requireRoleMock.mockClear()
    const client = buildMockClient({ orderRow: ORDER_ROW })
    serviceClientMock.mockReturnValue(client)

    const res = await renderPOST(
      new Request('http://localhost/api/print/jobs/render', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${envMock.PRINT_BRIDGE_SECRET}`,
        },
      }) as never
    )
    expect(res.status).toBe(200)
    expect(requireRoleMock).not.toHaveBeenCalled()
  })
})
