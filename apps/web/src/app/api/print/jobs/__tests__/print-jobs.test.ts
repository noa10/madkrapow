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
const { GET: claimStaffGET } = await import('../../jobs/claim-staff/route')
const { POST: renderPOST } = await import('../../jobs/render/route')

const ORDER_ID = '6a1b2c3d-4e5f-4a1b-8c2d-3e4f5a6b7c8d'

const ORDER_ROW = {
  id: ORDER_ID,
  order_number: 'MKTEST1',
  source: 'counter',
  status: 'paid',
  created_at: new Date(Date.now() - 60_000).toISOString(),
  updated_at: new Date(Date.now() - 60_000).toISOString(),
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
  /** Apply the emitted PostgREST filters and persist markers between polls. */
  realisticClaims?: boolean
}

function matchesFilter(row: Record<string, unknown>, filter: string): boolean {
  const group = /^(and|or)\((.*)\)$/.exec(filter)
  if (group) {
    let depth = 0
    let start = 0
    const parts: string[] = []
    for (let i = 0; i < group[2].length; i++) {
      if (group[2][i] === '(') depth++
      if (group[2][i] === ')') depth--
      if (group[2][i] === ',' && depth === 0) {
        parts.push(group[2].slice(start, i))
        start = i + 1
      }
    }
    parts.push(group[2].slice(start))
    return group[1] === 'and'
      ? parts.every((part) => matchesFilter(row, part))
      : parts.some((part) => matchesFilter(row, part))
  }
  const predicate = /^([\w]+)\.(eq|in|not\.is)\.(.*)$/.exec(filter)
  if (!predicate) throw new Error(`Unsupported filter: ${filter}`)
  const [, column, operator, value] = predicate
  if (operator === 'eq') return row[column] === value
  if (operator === 'not.is' && value === 'null') return row[column] != null
  if (operator === 'in') return value.slice(1, -1).split(',').includes(String(row[column]))
  throw new Error(`Unsupported filter: ${filter}`)
}

/** `orders` returning a row is not enough — `.maybeSingle()` gives the live row. */
function buildMockClient(opts: Opts = {}) {
  const attemptedInserts: Array<{ table: string; payload: unknown }> = []
  const markers = new Set<string>()
  return {
    attemptedInserts,
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      const equals: Record<string, unknown> = {}
      const builder: {
        cols?: string
        select: (cols?: string) => unknown
        eq: (col: string, val: unknown) => unknown
        in: (col: string, vals: unknown[]) => unknown
        gte: (col: string, val: unknown) => unknown
        or: (filter: string) => unknown
        order: (col: string, opts?: unknown) => unknown
        range: () => Promise<{ data: unknown; error: null }>
        limit: (n: number) => unknown
        insert: (payload: unknown) => unknown
        maybeSingle: () => Promise<{ data: unknown; error: null }>
        then: (resolve: (v: { data: unknown; error: null }) => void) => void
      } = {
        select(cols?: string) {
          builder.cols = cols
          return builder
        },
        eq(col: string, val: unknown) {
          equals[col] = val
          return builder
        },
        in(col: string, vals: unknown[]) {
          filters.push((row) => vals.includes(row[col]))
          return builder
        },
        gte(col: string, val: unknown) {
          filters.push((row) => String(row[col]) >= String(val))
          return builder
        },
        or(filter: string) {
          filters.push((row) => matchesFilter(row, `or(${filter})`))
          return builder
        },
        order(_col: string, _opts?: unknown) {
          return builder
        },
        range: async () => ({ data: table === 'payments' ? [{ method: 'cash', raw: null }] : null, error: null }),
        limit(_n: number) {
          return builder
        },
        insert(payload: unknown) {
          attemptedInserts.push({ table, payload })
          if (opts.realisticClaims && table === 'order_events' && !opts.markerInsertError) {
            const marker = payload as { order_id: string; event_type: string }
            markers.add(`${marker.order_id}:${marker.event_type}`)
          }
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
            if (opts.realisticClaims) {
              const rows = (opts.orders ?? []) as Array<Record<string, unknown>>
              return { data: rows.find((row) => row.id === equals.id) ?? null, error: null }
            }
            return { data: (isPreflight ? opts.liveOrderRow : opts.orderRow) ?? null, error: null }
          }
          return { data: null, error: null }
        },
        then(resolve: (v: { data: unknown; error: null }) => void) {
          if (table === 'orders') {
            const orders = opts.orders ?? []
            resolve({ data: opts.realisticClaims ? orders.filter((row) => filters.every((filter) => filter(row as Record<string, unknown>))) : orders, error: null })
          }
          else if (table === 'order_items') resolve({ data: [ITEM_ROW], error: null })
          else if (table === 'order_item_modifiers') resolve({ data: [], error: null })
          else if (table === 'payments') resolve({ data: [{ method: 'cash', raw: null }], error: null })
          else if (table === 'order_events') {
            const exists = opts.realisticClaims
              ? markers.has(`${equals.order_id}:${equals.event_type}`)
              : opts.printedMarkerExists
            resolve({ data: exists ? [{ id: 'evt-0' }] : [], error: null })
          }
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

/**
 * A POS counter take-away order that the database completes at payment time.
 * `kitchen_status` is the marker that separates these new orders from
 * historical `delivered` rows, which must never print.
 */
function completedPickup(overrides: Record<string, unknown> = {}) {
  return {
    ...ORDER_ROW,
    id: 'c0ffee00-0000-4000-8000-000000000001',
    status: 'delivered',
    source: 'counter',
    delivery_type: 'self_pickup',
    kitchen_status: 'paid',
    ...overrides,
  }
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

  it('claims pending dine-in and counter dockets but skips pending web checkouts', async () => {
    const dineInPending = {
      ...ORDER_ROW,
      id: 'dine-in-1',
      source: 'web',
      status: 'pending',
      delivery_type: 'dine_in',
    }
    const webPending = {
      ...ORDER_ROW,
      id: 'web-1',
      source: 'web',
      status: 'pending',
      delivery_type: 'delivery',
    }
    const counterPending = {
      ...ORDER_ROW,
      id: 'counter-1',
      source: 'counter',
      status: 'pending',
      delivery_type: 'self_pickup',
    }
    const client = buildMockClient({
      orders: [dineInPending, webPending, counterPending],
      liveOrderRow: dineInPending,
      orderRow: dineInPending,
    })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    // Unpaid tickets print the docket immediately; receipts wait for
    // settlement. Abandoned web checkouts never print.
    expect(json.jobs.map((job: { type: string }) => job.type)).toEqual([
      'kitchen_docket',
      'kitchen_docket',
    ])
    const markers = client.attemptedInserts.filter(
      (insert) => insert.table === 'order_events'
    )
    expect(markers.map((marker) => marker.payload)).toEqual([
      expect.objectContaining({
        order_id: 'dine-in-1',
        event_type: 'printed_kitchen_docket',
      }),
      expect.objectContaining({
        order_id: 'counter-1',
        event_type: 'printed_kitchen_docket',
      }),
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

  it('claims a newly completed counter pickup for the LAN bridge', async () => {
    const pickup = completedPickup()
    const client = buildMockClient({ orders: [pickup], realisticClaims: true })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.jobs.map((job: { type: string }) => job.type).sort()).toEqual([
      'kitchen_docket',
      'receipt',
    ])
    expect(json.jobs.every((job: { order_id: string }) => job.order_id === pickup.id)).toBe(true)
    expect(markersOf(client).sort()).toEqual(['printed_kitchen_docket', 'printed_receipt'])
  })

  it('claims a newly completed counter pickup for the merchant app', async () => {
    requireRoleMock.mockResolvedValue({ role: 'cashier' })
    const pickup = completedPickup()
    const client = buildMockClient({ orders: [pickup], realisticClaims: true })
    serviceClientMock.mockReturnValue(client)

    const res = await claimStaffGET(
      new Request('http://localhost/api/print/jobs/claim-staff', {
        headers: { authorization: 'Bearer staff-token' },
      }) as never
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.jobs.map((job: { type: string }) => job.type).sort()).toEqual([
      'kitchen_docket',
      'receipt',
    ])
  })

  it('still claims a completed pickup after the kitchen marks it ready', async () => {
    const pickup = completedPickup({ kitchen_status: 'ready' })
    const client = buildMockClient({ orders: [pickup], realisticClaims: true })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()

    expect(json.jobs.map((job: { type: string }) => job.type).sort()).toEqual([
      'kitchen_docket',
      'receipt',
    ])
  })

  it('never claims a historical delivered pickup without kitchen state', async () => {
    const historical = completedPickup({ kitchen_status: null })
    const client = buildMockClient({ orders: [historical], realisticClaims: true })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()

    expect(json.jobs).toHaveLength(0)
    expect(markersOf(client)).toHaveLength(0)
  })

  it('does not claim a delivered web pickup even when kitchen state is present', async () => {
    const webPickup = completedPickup({ source: 'web' })
    const client = buildMockClient({ orders: [webPickup], realisticClaims: true })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()

    expect(json.jobs).toHaveLength(0)
  })

  it('does not claim a delivered counter order that is not a pickup', async () => {
    const delivered = completedPickup({ delivery_type: 'delivery' })
    const client = buildMockClient({ orders: [delivered], realisticClaims: true })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()

    expect(json.jobs).toHaveLength(0)
  })

  it('applies each channel cutoff to completed pickups', async () => {
    const bridgeStale = completedPickup({
      id: 'stale-bridge',
      updated_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
    })
    const bridgeClient = buildMockClient({ orders: [bridgeStale], realisticClaims: true })
    serviceClientMock.mockReturnValue(bridgeClient)

    const bridgeRes = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    expect((await bridgeRes.json()).jobs).toHaveLength(0)

    requireRoleMock.mockResolvedValue({ role: 'cashier' })
    const staffStale = completedPickup({
      id: 'stale-staff',
      updated_at: new Date(Date.now() - 31 * 60_000).toISOString(),
    })
    const staffClient = buildMockClient({ orders: [staffStale], realisticClaims: true })
    serviceClientMock.mockReturnValue(staffClient)

    const staffRes = await claimStaffGET(
      new Request('http://localhost/api/print/jobs/claim-staff') as never
    )
    expect((await staffRes.json()).jobs).toHaveLength(0)
  })

  it('claims a completed pickup only once across repeated polls', async () => {
    const pickup = completedPickup()
    const client = buildMockClient({ orders: [pickup], realisticClaims: true })
    serviceClientMock.mockReturnValue(client)

    const first = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const second = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)

    expect((await first.json()).jobs).toHaveLength(2)
    expect((await second.json()).jobs).toHaveLength(0)
    expect(markersOf(client)).toHaveLength(2)
  })

  it('keeps the existing job matrix for paid, pending and completed orders', async () => {
    const paidWeb = {
      ...ORDER_ROW,
      id: 'paid-web',
      source: 'web',
      status: 'paid',
      delivery_type: 'delivery',
    }
    const pendingWeb = {
      ...ORDER_ROW,
      id: 'pending-web',
      source: 'web',
      status: 'pending',
      delivery_type: 'delivery',
    }
    const paidCounter = { ...ORDER_ROW, id: 'paid-counter' }
    const pendingCounter = {
      ...ORDER_ROW,
      id: 'pending-counter',
      status: 'pending',
      delivery_type: 'self_pickup',
    }
    const completed = completedPickup({ id: 'completed-pickup' })
    const client = buildMockClient({
      orders: [paidWeb, pendingWeb, paidCounter, pendingCounter, completed],
      realisticClaims: true,
    })
    serviceClientMock.mockReturnValue(client)

    const res = await claimGET(bridgeRequest('http://localhost/api/print/jobs/claim') as never)
    const json = await res.json()
    const types = json.jobs.map((job: { type: string }) => job.type)

    expect(types.filter((type: string) => type === 'kitchen_docket')).toHaveLength(4)
    expect(types.filter((type: string) => type === 'receipt')).toHaveLength(3)
    expect(json.jobs.some((job: { order_id: string }) => job.order_id === pendingWeb.id)).toBe(false)
  })
})

describe('POST /api/print/jobs/render', () => {
  const body = { order_id: ORDER_ID, type: 'receipt', reprint: true }

  it('renders bytes for staff reprints with a REPRINT watermark', async () => {
    requireRoleMock.mockResolvedValue({ user: { id: 'u1', app_metadata: { role: 'cashier' } } })
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
    requireRoleMock.mockResolvedValue({ user: { id: 'u1', app_metadata: { role: 'cashier' } } })
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

  it('returns 503 rather than an unhandled error when loading print data fails', async () => {
    requireRoleMock.mockResolvedValue({ user: { app_metadata: { role: 'cashier' } } })
    const client = buildMockClient({ orderRow: ORDER_ROW })
    const originalFrom = client.from
    client.from = (table: string) => {
      if (table === 'payments') throw new Error('payments unavailable')
      return originalFrom(table)
    }
    serviceClientMock.mockReturnValue(client)
    const res = await renderPOST(
      new Request('http://localhost/api/print/jobs/render', {
        method: 'POST', body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer staff-token' },
      }) as never
    )
    expect(res.status).toBe(503)
  })

  it('enforces kitchen queue visibility for staff while retaining bridge access', async () => {
    const delivered = { ...ORDER_ROW, status: 'delivered' }
    requireRoleMock.mockResolvedValue({ user: { app_metadata: { role: 'kitchen' } } })
    serviceClientMock.mockReturnValue(buildMockClient({ orderRow: delivered }))
    const staffRes = await renderPOST(
      new Request('http://localhost/api/print/jobs/render', {
        method: 'POST', body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', authorization: 'Bearer staff-token' },
      }) as never
    )
    expect(staffRes.status).toBe(404)

    serviceClientMock.mockReturnValue(buildMockClient({ orderRow: delivered }))
    const bridgeRes = await renderPOST(
      new Request('http://localhost/api/print/jobs/render', {
        method: 'POST', body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${envMock.PRINT_BRIDGE_SECRET}` },
      }) as never
    )
    expect(bridgeRes.status).toBe(200)
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
