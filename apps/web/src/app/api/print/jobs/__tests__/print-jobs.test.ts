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
  /** Returned by loadPrintOrder's `orders` lookup (the render path). */
  orderRow?: unknown
  /** Returned by the claim route's pre-flight existence check. */
  liveOrderRow?: unknown
  /** Simulate a failing marker insert (e.g. a Postgres error code). */
  markerInsertError?: { code?: string; message: string } | null
}

/** `orders` returning a row is not enough — `.maybeSingle()` gives the live row. */
function buildMockClient(opts: Opts = {}) {
  const attemptedInserts: Array<{ table: string; payload: unknown }> = []
  return {
    attemptedInserts,
    from(table: string) {
      const builder: {
        cols?: string
        select: (cols?: string) => unknown
        eq: (col: string, val: unknown) => unknown
        in: (col: string, vals: unknown[]) => unknown
        gte: (col: string, val: unknown) => unknown
        order: (col: string, opts?: unknown) => unknown
        limit: (n: number) => unknown
        insert: (payload: unknown) => unknown
        maybeSingle: () => Promise<{ data: unknown; error: null }>
        then: (resolve: (v: { data: unknown; error: null }) => void) => void
      } = {
        select(cols?: string) {
          builder.cols = cols
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
          attemptedInserts.push({ table, payload })
          return {
            // Awaiting the insert yields `{ error }`; chaining `.select().single()`
            // is only used by callers that want the inserted row back.
            error: opts.markerInsertError ?? null,
            select: () => ({ single: async () => ({ data: { id: 'evt-1' }, error: null }) }),
          }
        },
        maybeSingle: async () => {
          // Two call sites hit `orders.maybeSingle()`: the claim route's
          // pre-flight existence check (`select('id')`) and loadPrintOrder
          // (`select('<many cols>')`). Distinguish them so a test can express
          // "loadable but already deleted" and exercise the pre-flight alone.
          const isPreflight = builder.cols === 'id'
          if (table === 'orders') {
            return { data: (isPreflight ? opts.liveOrderRow : opts.orderRow) ?? null, error: null }
          }
          return { data: null, error: null }
        },
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

const markersOf = (client: { attemptedInserts: Array<{ table: string; payload: unknown }> }) =>
  client.attemptedInserts
    .filter((i) => i.table === 'order_events')
    .map((i) => (i.payload as { event_type: string }).event_type)

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
    const client = buildMockClient({ orders: [ORDER_ROW], liveOrderRow: ORDER_ROW, orderRow: ORDER_ROW })
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
    expect(markersOf(client)).toHaveLength(2)
    expect(markersOf(client).sort()).toEqual([
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
    expect(markersOf(client)).toHaveLength(0)
  })

  it('skips an order that vanished after the query, without attempting a claim', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Listed by the initial query, then deleted before the pre-flight check.
      // loadPrintOrder would still succeed, so if the pre-flight check is ever
      // removed this test fails: the insert would run and a job would be emitted.
      const client = buildMockClient({
        orders: [ORDER_ROW],
        liveOrderRow: null,
        orderRow: ORDER_ROW,
      })
      serviceClientMock.mockReturnValue(client)

      const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.jobs).toHaveLength(0)
      expect(markersOf(client)).toHaveLength(0)
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('treats an FK violation on the marker insert as a vanished order, not an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // Exists for the pre-flight check, then deleted before the marker insert —
      // this is the race seen in production (23503).
      const client = buildMockClient({
        orders: [ORDER_ROW],
        liveOrderRow: ORDER_ROW,
        orderRow: ORDER_ROW,
        markerInsertError: {
          code: '23503',
          message:
            'insert or update on table "order_events" violates foreign key constraint "order_events_order_id_fkey"',
        },
      })
      serviceClientMock.mockReturnValue(client)

      const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.jobs).toHaveLength(0)
      // The insert was attempted (it failed) — proving we hit the FK path.
      expect(markersOf(client).length).toBeGreaterThan(0)
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('treats a unique violation as a lost race, without logging an error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const client = buildMockClient({
        orders: [ORDER_ROW],
        liveOrderRow: ORDER_ROW,
        orderRow: ORDER_ROW,
        markerInsertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })
      serviceClientMock.mockReturnValue(client)

      const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.jobs).toHaveLength(0)
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('still logs genuinely unexpected claim failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const client = buildMockClient({
        orders: [ORDER_ROW],
        liveOrderRow: ORDER_ROW,
        orderRow: ORDER_ROW,
        markerInsertError: { code: '08006', message: 'connection failure' },
      })
      serviceClientMock.mockReturnValue(client)

      const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
      expect(res.status).toBe(200)
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
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
