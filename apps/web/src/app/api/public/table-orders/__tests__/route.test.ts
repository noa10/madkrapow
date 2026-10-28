import { describe, expect, it, vi, beforeEach } from 'vitest'

// The route creates its service-role client per request.
const state = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => state.client,
}))

import { POST } from '../route'

const TOKEN = 'a'.repeat(32)
const TABLE = { id: 'table-1', label: 'T3', is_active: true }
const ITEM = '11111111-1111-4111-8111-111111111111'
const MOD = '22222222-2222-4222-8222-222222222222'
const GROUP = '33333333-3333-4333-8333-333333333333'

type Call = {
  table: string
  op: string
  row?: Record<string, unknown>
  rows?: Record<string, unknown>[]
}

interface MockOptions {
  table?: Record<string, unknown> | null
  recent?: { created_at: string }[]
  /** Order returned by an idempotency-key lookup. */
  existingOrder?: Record<string, unknown> | null
  /** Simulate the orders insert failing (e.g. a 23505 unique violation). */
  orderInsertError?: { message: string; code?: string } | null
  menu?: Record<string, unknown>[]
  modifiers?: Record<string, unknown>[]
  junctions?: Record<string, unknown>[]
  groups?: Record<string, unknown>[]
}

function queryResult(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
    builder[method] = () => builder
  }
  builder.maybeSingle = async () => ({ data, error })
  builder.single = async () => ({ data, error })
  // Supabase builders are thenable; `await` must resolve the result.
  builder.then = (resolve: (value: unknown) => void) => resolve({ data, error })
  return builder
}

function buildClient(options: MockOptions) {
  const calls: Call[] = []

  const client = {
    calls,
    from(table: string) {
      if (table === 'restaurant_tables') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: options.table ?? null, error: null }),
            }),
          }),
        }
      }

      if (table === 'orders') {
        return {
          select: () => {
            let idempotencyLookup = false
            const builder: Record<string, unknown> = {}
            builder.eq = (column: string) => {
              if (column === 'idempotency_key') idempotencyLookup = true
              return builder
            }
            for (const method of ['in', 'gte', 'order', 'limit']) {
              builder[method] = () => builder
            }
            builder.maybeSingle = async () => ({
              data: idempotencyLookup ? (options.existingOrder ?? null) : null,
              error: null,
            })
            builder.single = async () => ({ data: null, error: null })
            builder.then = (resolve: (value: unknown) => void) =>
              resolve({ data: options.recent ?? [], error: null })
            return builder
          },
          insert: (row: Record<string, unknown>) => {
            calls.push({ table, op: 'insert', row })
            return {
              select: () => ({
                single: async () => ({
                  data: options.orderInsertError
                    ? null
                    : {
                        id: 'order-1',
                        order_number: 'MKTEST1234',
                        display_code: 'MK-001',
                      },
                  error: options.orderInsertError ?? null,
                }),
              }),
            }
          },
          delete: () => ({
            eq: () => ({
              then: (resolve: (value: unknown) => void) =>
                resolve({ error: null }),
            }),
          }),
        }
      }

      if (table === 'menu_items') {
        return { select: () => queryResult(options.menu ?? []) }
      }
      if (table === 'modifiers') {
        return { select: () => queryResult(options.modifiers ?? []) }
      }
      if (table === 'menu_item_modifier_groups') {
        return { select: () => queryResult(options.junctions ?? []) }
      }
      if (table === 'modifier_groups') {
        return { select: () => queryResult(options.groups ?? []) }
      }

      if (table === 'order_items') {
        return {
          insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
            calls.push({
              table,
              op: 'insert',
              rows: Array.isArray(rows) ? rows : [rows],
            })
            return {
              then: (resolve: (value: unknown) => void) =>
                resolve({ error: null }),
            }
          },
        }
      }

      if (table === 'order_item_modifiers' || table === 'order_events') {
        return {
          insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
            calls.push({
              table,
              op: 'insert',
              rows: Array.isArray(rows) ? rows : [rows],
            })
            return {
              then: (resolve: (value: unknown) => void) =>
                resolve({ error: null }),
            }
          },
        }
      }

      return { select: () => queryResult([]) }
    },
  }

  return client
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/public/table-orders', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

const VALID_BODY = {
  table_token: TOKEN,
  pax: 3,
  items: [
    {
      menu_item_id: ITEM,
      quantity: 2,
      modifier_ids: [MOD],
    },
  ],
}

const BASE_DATA: MockOptions = {
  table: TABLE,
  recent: [],
  menu: [{ id: ITEM, name: 'Krapow', price_cents: 1250, is_available: true }],
  modifiers: [
    {
      id: MOD,
      name: 'Fried egg',
      price_delta_cents: 200,
      modifier_group_id: GROUP,
      is_available: true,
    },
  ],
  junctions: [
    { menu_item_id: ITEM, modifier_group_id: GROUP, is_required: false },
  ],
  groups: [{ id: GROUP, name: 'Add-ons', min_selections: 0, max_selections: 2 }],
}

describe('POST /api/public/table-orders', () => {
  beforeEach(() => {
    state.client = null
  })

  it('creates a pending dine-in order priced from the database', async () => {
    const client = buildClient(BASE_DATA)
    state.client = client

    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(201)

    const body = await response.json()
    expect(body).toMatchObject({
      order_id: 'order-1',
      display_code: 'MK-001',
      total_cents: 2900, // (1250 + 200) × 2
      table_label: 'T3',
      pax: 3,
    })

    const orderInsert = client.calls.find(
      (call) => call.table === 'orders' && call.op === 'insert'
    )
    expect(orderInsert?.row).toMatchObject({
      status: 'pending',
      source: 'web',
      delivery_type: 'dine_in',
      table_id: 'table-1',
      table_label: 'T3',
      pax: 3,
      subtotal_cents: 2900,
      total_cents: 2900,
      delivery_fee_cents: 0,
      include_cutlery: false,
    })

    const itemInsert = client.calls.find(
      (call) => call.table === 'order_items' && call.op === 'insert'
    )
    expect(itemInsert?.rows?.[0]).toMatchObject({
      menu_item_id: ITEM,
      menu_item_name: 'Krapow',
      menu_item_price_cents: 1250,
      quantity: 2,
      line_total_cents: 2900,
    })

    const modifierInsert = client.calls.find(
      (call) => call.table === 'order_item_modifiers' && call.op === 'insert'
    )
    expect(modifierInsert?.rows).toEqual([
      {
        order_item_id: expect.any(String),
        modifier_id: MOD,
        modifier_name: 'Fried egg',
        modifier_price_delta_cents: 200,
      },
    ])

    const eventInsert = client.calls.find(
      (call) => call.table === 'order_events' && call.op === 'insert'
    )
    expect(eventInsert?.rows?.[0]).toMatchObject({
      event_type: 'table_order_placed',
      actor_id: null,
    })
  })

  it('accepts seeded menu and modifier ids that are UUID-shaped but not RFC v4', async () => {
    // Production menu fixtures use ids like 00000004-… (version nibble 0);
    // z.uuid() rejected them, which blocked every table-QR order line.
    const seededItem = '00000004-0000-0000-0000-000000000005'
    const seededModifier = '00000003-0000-0000-0000-000000000001'
    const seededGroup = '00000002-0000-0000-0000-000000000001'
    const client = buildClient({
      table: TABLE,
      recent: [],
      menu: [
        { id: seededItem, name: 'Krapow Daging', price_cents: 1000, is_available: true },
      ],
      modifiers: [
        {
          id: seededModifier,
          name: 'Medium Spice',
          price_delta_cents: 0,
          modifier_group_id: seededGroup,
          is_available: true,
        },
      ],
      junctions: [
        { menu_item_id: seededItem, modifier_group_id: seededGroup, is_required: false },
      ],
      groups: [
        { id: seededGroup, name: 'Tahap Kepedasan', min_selections: 1, max_selections: 1 },
      ],
    })
    state.client = client

    const response = await POST(
      makeRequest({
        table_token: TOKEN,
        pax: 2,
        items: [
          { menu_item_id: seededItem, quantity: 1, modifier_ids: [seededModifier] },
        ],
      }) as never
    )

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.total_cents).toBe(1000)
  })

  it('rejects an unknown token', async () => {
    state.client = buildClient({ ...BASE_DATA, table: null })
    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(404)
  })

  it('rejects an inactive table', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      table: { ...TABLE, is_active: false },
    })
    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(404)
  })

  it('rate-limits a table that already has four orders in the window', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      recent: Array.from({ length: 4 }, () => ({
        created_at: new Date(Date.now() - 120_000).toISOString(),
      })),
    })
    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(429)
  })

  it('accepts a second order inside ten seconds', async () => {
    // Two diners at one table sending within seconds is normal; the 4 / 5 min
    // cap is the abuse bound (the 10 s gap was removed in migration 063).
    state.client = buildClient({
      ...BASE_DATA,
      recent: [{ created_at: new Date(Date.now() - 2_000).toISOString() }],
    })
    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(201)
  })

  it('returns the existing order when a submission is retried with the same key', async () => {
    const client = buildClient({
      ...BASE_DATA,
      // Even with the table at its cap, a retry must resolve to the order that
      // already landed rather than a 429.
      recent: Array.from({ length: 4 }, () => ({
        created_at: new Date(Date.now() - 120_000).toISOString(),
      })),
      existingOrder: {
        id: 'order-9',
        order_number: 'MKORIGINAL',
        display_code: 'MK-009',
        total_cents: 2900,
        pax: 3,
        table_label: 'T3',
        table_id: 'table-1',
      },
    })
    state.client = client

    const response = await POST(
      makeRequest({ ...VALID_BODY, idempotency_key: 'retry-key-0000000001' }) as never
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      order_id: 'order-9',
      display_code: 'MK-009',
      total_cents: 2900,
      duplicate: true,
    })
    expect(
      client.calls.some((call) => call.table === 'orders' && call.op === 'insert')
    ).toBe(false)
  })

  it('rejects a key that was already used at another table', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      existingOrder: {
        id: 'order-9',
        order_number: 'MKORIGINAL',
        display_code: 'MK-009',
        total_cents: 2900,
        pax: 3,
        table_label: 'T9',
        table_id: 'another-table',
      },
    })
    const response = await POST(
      makeRequest({ ...VALID_BODY, idempotency_key: 'retry-key-0000000001' }) as never
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/another table/i)
  })

  it('returns the original order when a concurrent retry wins the insert race', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      orderInsertError: {
        message: 'duplicate key value violates unique constraint',
        code: '23505',
      },
      existingOrder: {
        id: 'order-9',
        order_number: 'MKORIGINAL',
        display_code: 'MK-009',
        total_cents: 2900,
        pax: 3,
        table_label: 'T3',
        table_id: 'table-1',
      },
    })
    const response = await POST(
      makeRequest({ ...VALID_BODY, idempotency_key: 'retry-key-0000000001' }) as never
    )
    expect(response.status).toBe(200)
    expect((await response.json()).duplicate).toBe(true)
  })

  it('rejects unavailable menu items', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      menu: [{ id: ITEM, name: 'Krapow', price_cents: 1250, is_available: false }],
    })
    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(400)
    expect((await response.json()).error).toMatch(/no longer available/i)
  })

  it('rejects a modifier that is not attached to the item', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      modifiers: [
        {
          id: MOD,
          name: 'Fried egg',
          price_delta_cents: 200,
          modifier_group_id: 'other-group',
          is_available: true,
        },
      ],
    })
    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('INVALID_MODIFIER')
  })

  it('rejects an invalid pax', async () => {
    state.client = buildClient(BASE_DATA)
    const response = await POST(
      makeRequest({ ...VALID_BODY, pax: 0 }) as never
    )
    expect(response.status).toBe(400)
  })
})
