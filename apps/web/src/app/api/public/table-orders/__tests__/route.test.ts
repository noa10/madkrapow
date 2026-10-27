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

type Call = { table: string; op: string; row?: Record<string, unknown>; rows?: unknown }

interface MockOptions {
  table?: Record<string, unknown> | null
  recent?: { created_at: string }[]
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
  let lineCounter = 0

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
          select: () => queryResult(options.recent ?? []),
          insert: (row: Record<string, unknown>) => {
            calls.push({ table, op: 'insert', row })
            return {
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'order-1',
                    order_number: 'MKTEST1234',
                    display_code: 'MK-001',
                  },
                  error: null,
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
          insert: (row: Record<string, unknown>) => {
            calls.push({ table, op: 'insert', row })
            return {
              select: () => ({
                single: async () => ({
                  data: { id: `line-${++lineCounter}` },
                  error: null,
                }),
              }),
            }
          },
        }
      }

      if (table === 'order_item_modifiers' || table === 'order_events') {
        return {
          insert: (rows: unknown) => {
            calls.push({ table, op: 'insert', rows })
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
    expect(itemInsert?.row).toMatchObject({
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
    expect(eventInsert?.rows).toMatchObject({
      event_type: 'table_order_placed',
      actor_id: null,
    })
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

  it('rate-limits a second order within ten seconds', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      recent: [{ created_at: new Date(Date.now() - 2_000).toISOString() }],
    })
    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(429)
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
