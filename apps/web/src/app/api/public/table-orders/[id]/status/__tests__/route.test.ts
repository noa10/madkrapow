import { describe, expect, it, vi, beforeEach } from 'vitest'

// The route creates its service-role client per request.
const state = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => state.client,
}))

import { POST } from '../route'

const TOKEN = 'a'.repeat(32)
const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const KEY = 'k'.repeat(32)
const TABLE = { id: 'table-1', is_active: true }

function context(id = ORDER_ID) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/public/table-orders/${ORDER_ID}/status`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  ) as unknown as Request
}

const VALID_BODY = { table_token: TOKEN, idempotency_key: KEY }

interface MockOptions {
  table?: Record<string, unknown> | null
  tableError?: { message: string } | null
  order?: Record<string, unknown> | null
  orderError?: { message: string } | null
  payment?: Record<string, unknown> | null
  paymentError?: { message: string } | null
}

interface FilterCall {
  table: string
  column: string
  value: unknown
}

function buildClient(options: MockOptions = {}) {
  const filters: FilterCall[] = []
  const record = (table: string, column: string, value: unknown) => {
    filters.push({ table, column, value })
  }

  const client = {
    from: (table: string) => {
      if (table === 'restaurant_tables') {
        return {
          select: () => ({
            eq: (column: string, value: unknown) => {
              record(table, column, value)
              return {
                maybeSingle: async () => ({
                  data: options.table === undefined ? TABLE : options.table,
                  error: options.tableError ?? null,
                }),
              }
            },
          }),
        }
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: (column: string, value: unknown) => {
              record(table, column, value)
              return {
                eq: (column2: string, value2: unknown) => {
                  record(table, column2, value2)
                  return {
                    eq: (column3: string, value3: unknown) => {
                      record(table, column3, value3)
                      return {
                        maybeSingle: async () => ({
                          data: options.order ?? null,
                          error: options.orderError ?? null,
                        }),
                      }
                    },
                  }
                },
              }
            },
          }),
        }
      }
      if (table === 'payments') {
        return {
          select: () => ({
            eq: (column: string, value: unknown) => {
              record(table, column, value)
              return {
                eq: (column2: string, value2: unknown) => {
                  record(table, column2, value2)
                  return {
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: options.payment ?? null,
                        error: options.paymentError ?? null,
                      }),
                    }),
                  }
                },
              }
            },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { client, filters }
}

const PENDING_ORDER = {
  id: ORDER_ID,
  status: 'pending',
  total_cents: 2500,
  payment_method: null,
}

beforeEach(() => {
  state.client = null
})

describe('POST /api/public/table-orders/[id]/status', () => {
  it('returns the live status for a pending order', async () => {
    const { client } = buildClient({ order: PENDING_ORDER })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({
      order_id: ORDER_ID,
      status: 'pending',
      total_cents: 2500,
      payment_method: null,
      paid_at: null,
      payment_recorded: false,
    })
  })

  it('reports a paid order the phone never learned about', async () => {
    // The claim landed but its response was lost. The resumed screen used to
    // keep showing "pending" with a live QR; this read is what corrects it.
    const { client } = buildClient({
      order: { ...PENDING_ORDER, status: 'paid', payment_method: 'qr_pay' },
      payment: {
        method: 'qr_pay',
        status: 'succeeded',
        paid_at: '2026-10-28T10:00:00.000Z',
      },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      status: 'paid',
      payment_method: 'qr_pay',
      paid_at: '2026-10-28T10:00:00.000Z',
      payment_recorded: true,
    })
  })

  it('reports the cashier’s method so the screen does not claim a QR transfer', async () => {
    const { client } = buildClient({
      order: { ...PENDING_ORDER, status: 'paid', payment_method: 'cash' },
      payment: {
        method: 'cash',
        status: 'succeeded',
        paid_at: '2026-10-28T09:30:00.000Z',
      },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.payment_method).toBe('cash')
    expect(json.payment_recorded).toBe(true)
  })

  it('falls back to the order’s method when the ledger row is missing', async () => {
    // A manually marked-paid order has no payment row; the order still records
    // how it was settled.
    const { client } = buildClient({
      order: { ...PENDING_ORDER, status: 'paid', payment_method: 'cash' },
      payment: null,
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())
    const json = await res.json()

    expect(json.payment_method).toBe('cash')
    expect(json.payment_recorded).toBe(false)
  })

  it('returns 404 for a wrong key, never revealing that the order exists', async () => {
    const { client } = buildClient({ order: null })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Order not found' })
  })

  it('scopes the read to the table and the create key', async () => {
    // The idempotency key is the order's secret: dropping either filter would
    // let any diner at the table read another round's status.
    const { client, filters } = buildClient({ order: PENDING_ORDER })
    state.client = client

    await POST(makeRequest(VALID_BODY) as never, context())

    expect(filters).toEqual([
      { table: 'restaurant_tables', column: 'qr_token', value: TOKEN },
      { table: 'orders', column: 'id', value: ORDER_ID },
      { table: 'orders', column: 'table_id', value: TABLE.id },
      { table: 'orders', column: 'idempotency_key', value: KEY },
      { table: 'payments', column: 'order_id', value: ORDER_ID },
      { table: 'payments', column: 'status', value: 'succeeded' },
    ])
  })

  it('returns 404 for an inactive table before reading the order', async () => {
    const { client } = buildClient({
      table: { id: TABLE.id, is_active: false },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(404)
  })

  it('returns 400 when the key is missing', async () => {
    const { client } = buildClient({ order: PENDING_ORDER })
    state.client = client

    const res = await POST(
      makeRequest({ table_token: TOKEN }) as never,
      context()
    )

    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-guid order id', async () => {
    const { client } = buildClient({ order: PENDING_ORDER })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context('not-a-guid'))

    expect(res.status).toBe(400)
  })

  it('returns 500 when the order lookup fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = buildClient({ orderError: { message: 'connection reset' } })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(500)
    spy.mockRestore()
  })

  it('returns 500 when the payment lookup fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = buildClient({
      order: PENDING_ORDER,
      paymentError: { message: 'timeout' },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(500)
    spy.mockRestore()
  })

  it('rate-limits a flood of reads from one table', async () => {
    // Keyed by the token, so a flood is rejected before it reaches the
    // database. A distinct token keeps this test out of the other windows.
    const { client } = buildClient({ order: PENDING_ORDER })
    state.client = client
    const floodToken = 'z'.repeat(32)

    let lastStatus = 200
    for (let i = 0; i < 241; i += 1) {
      const res = await POST(
        makeRequest({ table_token: floodToken, idempotency_key: KEY }) as never,
        context()
      )
      lastStatus = res.status
    }

    expect(lastStatus).toBe(429)
  })
})
