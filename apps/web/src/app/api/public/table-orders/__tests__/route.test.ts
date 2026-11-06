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
}

interface MockOptions {
  table?: Record<string, unknown> | null
  /** Order returned by an idempotency-key lookup. */
  existingOrder?: Record<string, unknown> | null
  /** A concurrent order visible only after the transaction attempt. */
  existingOrderAfterRpc?: Record<string, unknown> | null
  /** Simulate the atomic order transaction failing. */
  rpcError?: { message: string; code?: string } | null
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
  let rpcAttempted = false

  const client = {
    calls,
    async rpc(name: string, params: Record<string, unknown>) {
      calls.push({ table: name, op: 'rpc', row: params })
      rpcAttempted = true
      const order = params.p_order as { subtotal_cents: number; pax: number }
      const error = options.rpcError ?? null
      return {
        data: error ? null : {
          order_id: 'order-1',
          order_number: 'MKTEST1234',
          display_code: 'MK-001',
          table_label: options.table?.label,
          pax: order.pax,
          total_cents: order.subtotal_cents,
          status: 'pending',
          duplicate: false,
        },
        error,
      }
    },
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
              data: idempotencyLookup
                ? (rpcAttempted ? options.existingOrderAfterRpc ?? options.existingOrder ?? null : options.existingOrder ?? null)
                : null,
              error: null,
            })
            builder.single = async () => ({ data: null, error: null })
            return builder
          },
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

    expect(client.calls).toContainEqual({
      table: 'create_table_qr_order',
      op: 'rpc',
      row: expect.objectContaining({
        p_order: expect.objectContaining({
          table_id: 'table-1',
          pax: 3,
          subtotal_cents: 2900,
        }),
        p_lines: [{
          menu_item_id: ITEM,
          quantity: 2,
          notes: null,
          modifiers: [{ modifier_id: MOD }],
        }],
      }),
    })
  })

  it('returns an error when the atomic order transaction fails', async () => {
    const client = buildClient({ ...BASE_DATA, rpcError: { message: 'event insert failed' } })
    state.client = client

    const response = await POST(makeRequest(VALID_BODY) as never)

    expect(response.status).toBe(500)
    expect((await response.json()).error).toBe('Failed to create order')
    expect(client.calls).toContainEqual(expect.objectContaining({
      table: 'create_table_qr_order',
      op: 'rpc',
    }))
  })

  it.each([
    ['table_inactive', 409, /not active/i],
    ['idempotency_key_conflict', 409, /another table/i],
    ['table_order_rate_limited', 429, /too many orders/i],
    ['table_order_item_unavailable', 409, /menu changed/i],
    ['table_order_invalid_modifier', 409, /menu changed/i],
    ['table_order_total_mismatch', 409, /prices changed/i],
  ])('maps %s from the transaction to a safe response', async (message, status, expected) => {
    state.client = buildClient({ ...BASE_DATA, rpcError: { message } })
    const response = await POST(makeRequest(VALID_BODY) as never)
    expect(response.status).toBe(status)
    expect((await response.json()).error).toMatch(expected)
  })

  it('keeps the size message for the total-ceiling guard only', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      rpcError: { message: 'table_order_total_too_large' },
    })

    const response = await POST(makeRequest(VALID_BODY) as never)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('INVALID_REQUEST')
    expect(body.error).toMatch(/too large.*split/i)
  })

  it.each([
    'invalid_table_order',
    'invalid_table_order_lines',
    'invalid_table_order_number',
    'invalid_table_order_line',
    'invalid_table_order_modifiers',
  ])('does not disguise %s as a size problem', async (message) => {
    state.client = buildClient({ ...BASE_DATA, rpcError: { message } })

    const response = await POST(makeRequest(VALID_BODY) as never)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe('INVALID_REQUEST')
    expect(body.error).toBe('Unable to place order. Please try again.')
    expect(body.error).not.toMatch(/too large|split/i)
  })

  it('accepts seeded menu and modifier ids that are UUID-shaped but not RFC v4', async () => {
    // Production menu fixtures use ids like 00000004-… (version nibble 0);
    // z.uuid() rejected them, which blocked every table-QR order line.
    const seededItem = '00000004-0000-0000-0000-000000000005'
    const seededModifier = '00000003-0000-0000-0000-000000000001'
    const seededGroup = '00000002-0000-0000-0000-000000000001'
    const client = buildClient({
      table: TABLE,
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

  it('returns the existing order when a submission is retried with the same key', async () => {
    const client = buildClient({
      ...BASE_DATA,
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
      client.calls.some((call) => call.table === 'create_table_qr_order')
    ).toBe(false)
  })

  it('returns the real status for a duplicate that was already paid', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      existingOrder: {
        id: 'order-9',
        order_number: 'MKORIGINAL',
        display_code: 'MK-009',
        total_cents: 2900,
        pax: 3,
        table_label: 'T3',
        table_id: 'table-1',
        status: 'paid',
      },
    })

    const response = await POST(
      makeRequest({ ...VALID_BODY, idempotency_key: 'retry-key-0000000001' }) as never
    )
    expect(response.status).toBe(200)
    // A retried create after the diner claimed the bill must not report
    // `pending`: the success screen would ask them to pay again.
    expect((await response.json()).status).toBe('paid')
  })

  it('carries the recorded method for a duplicate a cashier settled', async () => {
    // Without the method the success screen would say "Payment received" for
    // a QR transfer that never landed.
    state.client = buildClient({
      ...BASE_DATA,
      existingOrder: {
        id: 'order-9',
        order_number: 'MKORIGINAL',
        display_code: 'MK-009',
        total_cents: 2900,
        pax: 3,
        table_label: 'T3',
        table_id: 'table-1',
        status: 'paid',
        payment_method: 'cash',
      },
    })

    const response = await POST(
      makeRequest({ ...VALID_BODY, idempotency_key: 'retry-key-0000000001' }) as never
    )
    expect(response.status).toBe(200)
    expect((await response.json()).payment_method).toBe('cash')
  })

  it('rejects a key that was already used at another table', async () => {    state.client = buildClient({
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
    const client = buildClient({
      ...BASE_DATA,
      rpcError: {
        message: 'duplicate key value violates unique constraint "idx_orders_idempotency_key"',
        code: '23505',
      },
      existingOrderAfterRpc: {
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
    expect((await response.json()).duplicate).toBe(true)
    expect(client.calls.some((call) => call.table === 'create_table_qr_order')).toBe(true)
  })

  it('does not treat an order-number collision as an idempotent retry', async () => {
    state.client = buildClient({
      ...BASE_DATA,
      rpcError: {
        message: 'duplicate key value violates unique constraint "orders_order_number_key"',
        code: '23505',
      },
      // An unrelated order may be committed with this key after the first lookup.
      existingOrderAfterRpc: {
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
    expect(response.status).toBe(500)
    expect((await response.json()).error).toBe('Failed to create order')
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
