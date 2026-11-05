import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock requireRole — the POS route authenticates via the shared staff guard.
// ---------------------------------------------------------------------------
const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { POST } from '../route'

const MENU_ROWS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Set Krapow Ayam', price_cents: 1250, is_available: true },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Kickapoo (320ml)', price_cents: 250, is_available: true },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Sold Out Item', price_cents: 900, is_available: false },
]

const TABLE_ID = '44444444-4444-4444-8444-444444444444'
const INACTIVE_TABLE_ID = '55555555-5555-4555-8555-555555555555'
const TABLES = [
  { id: TABLE_ID, label: 'T7', is_active: true },
  { id: INACTIVE_TABLE_ID, label: 'Old Patio', is_active: false },
]

type Call = { table: string; op: 'insert' | 'select' | 'delete'; row?: Record<string, unknown>; rows?: Record<string, unknown>[] }
type RpcCall = { name: string; args: Record<string, unknown> }

interface MockOptions {
  menu?: Record<string, unknown>[]
  modifiers?: Record<string, unknown>[]
  junctions?: Record<string, unknown>[]
  groups?: Record<string, unknown>[]
  /** Simulate the RPC failing after the order/line/payment writes began. */
  rpcError?: { message: string; code?: string }
  /** Total returned by the RPC (the DB is the pricing authority). */
  rpcTotal?: number
  rpcTableLabel?: string | null
}

function buildMockClient(options: MockOptions = {}) {
  const calls: Call[] = []
  const rpcCalls: RpcCall[] = []
  let lineCounter = 0

  const rowsFor = (table: string, column: string, ids: string[]) => {
    let rows: Record<string, unknown>[]
    if (table === 'menu_items') rows = options.menu ?? MENU_ROWS
    else if (table === 'modifiers') rows = options.modifiers ?? []
    else if (table === 'menu_item_modifier_groups') rows = options.junctions ?? []
    else if (table === 'modifier_groups') rows = options.groups ?? []
    else rows = []
    return rows.filter((row) => ids.includes(String(row[column])))
  }

  const client = {
    calls,
    from(table: string) {
      if (table === 'restaurant_tables') {
        return {
          select() {
            return {
              eq(_column: string, id: string) {
                return {
                  maybeSingle: async () => {
                    calls.push({ table, op: 'select' })
                    return {
                      data: TABLES.find((row) => row.id === id) ?? null,
                      error: null,
                    }
                  },
                }
              },
            }
          },
        }
      }

      return {
        select() {
          let data: Record<string, unknown>[] = []
          const builder = {
            eq: () => builder,
            in: (column: string, ids: string[]) => {
              data = rowsFor(table, column, ids)
              calls.push({ table, op: 'select' })
              return builder
            },
            order: () => builder,
            gte: () => builder,
            limit: () => builder,
            maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
            then: (resolve: (value: { data: unknown; error: null }) => void) =>
              resolve({ data, error: null }),
          }
          return builder
        },
        insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]
          calls.push({ table, op: 'insert', rows, row: rowOrRows as Record<string, unknown> })
          return {
            select() {
              return {
                single: async () => ({
                  data:
                    table === 'order_items'
                      ? { id: `line-${++lineCounter}` }
                      : {
                          id: 'order-uuid-1',
                          order_number: 'MKTEST1234',
                          display_code: 'MK-001',
                        },
                  error: null,
                }),
              }
            },
            then(resolve: (v: { error: unknown }) => void) {
              resolve({ error: null })
            },
          }
        },
        delete() {
          calls.push({ table, op: 'delete' })
          return {
            eq: () => ({
              then: (resolve: (v: { error: null }) => void) =>
                resolve({ error: null }),
            }),
          }
        },
      }
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      if (options.rpcError) {
        return Promise.resolve({ data: null, error: options.rpcError })
      }
      const order = args.p_order as {
        order_number: string
        table_id?: string | null
        pax?: number | null
      }
      return Promise.resolve({
        data: {
          order_id: 'order-uuid-1',
          order_number: order.order_number,
          display_code: 'MK-001',
          total_cents: options.rpcTotal ?? 0,
          table_label:
            options.rpcTableLabel ??
            (order.table_id ? 'T7' : null),
          pax: order.pax ?? null,
        },
        error: null,
      })
    },
  }
  return { ...client, rpcCalls }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/pos/orders', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

const SET_KRAPOW = MENU_ROWS[0].id
const KICKAPOO = MENU_ROWS[1].id
const SOLD_OUT = MENU_ROWS[2].id

const MODIFIER_ID = '66666666-6666-4666-8666-666666666666'
const GROUP_ID = '77777777-7777-4777-8777-777777777777'
const MODIFIER_ROWS = [
  {
    id: MODIFIER_ID,
    name: 'Fried Egg',
    price_delta_cents: 200,
    modifier_group_id: GROUP_ID,
    is_available: true,
  },
]
const JUNCTION_ROWS = [
  { menu_item_id: SET_KRAPOW, modifier_group_id: GROUP_ID, is_required: false },
]
const GROUP_ROWS = [
  { id: GROUP_ID, name: 'Add-ons', min_selections: 0, max_selections: 2 },
]

describe('POST /api/pos/orders', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
    requireRoleMock.mockResolvedValue({
      user: { id: 'staff-user-id' },
      supabase: null, // replaced per-test
    })
  })

  it('creates a counter order through the atomic RPC with DB-recomputed prices', async () => {
    const client = buildMockClient({ rpcTotal: 2750 })
    requireRoleMock.mockResolvedValue({
      user: { id: 'staff-user-id' },
      supabase: client,
    })

    const res = await POST(
      makeRequest({
        items: [
          { menu_item_id: SET_KRAPOW, quantity: 2 },
          { menu_item_id: KICKAPOO, quantity: 1 },
        ],
        payment_method: 'cash',
      }) as never,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    // 2 x RM12.50 + 1 x RM2.50 — the RPC returns the DB-recomputed total.
    expect(body.total_cents).toBe(2750)
    expect(body.display_code).toBe('MK-001')

    expect(client.rpcCalls).toHaveLength(1)
    const rpc = client.rpcCalls[0]
    expect(rpc.name).toBe('create_pos_order')
    expect(rpc.args.p_actor_id).toBe('staff-user-id')
    expect(rpc.args.p_order).toMatchObject({
      order_type: 'take_away',
      table_id: null,
      pax: null,
      payment_method: 'cash',
      customer_name: 'Walk-in',
      notes: null,
    })
    expect(rpc.args.p_items).toEqual([
      { menu_item_id: SET_KRAPOW, quantity: 2, modifier_ids: [], notes: null },
      { menu_item_id: KICKAPOO, quantity: 1, modifier_ids: [], notes: null },
    ])

    // The route must not write the order/items/payment itself any more: the
    // RPC owns the whole transaction.
    expect(client.calls.find((c) => c.op === 'insert')).toBeUndefined()
    expect(client.calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('accepts seeded menu and modifier ids that are UUID-shaped but not RFC v4', async () => {
    // Production menu fixtures use ids like 00000004-… (version nibble 0).
    // z.uuid() rejected them and silently blocked every POS order; z.guid()
    // must keep accepting them.
    const seededItem = '00000004-0000-0000-0000-000000000005'
    const seededModifier = '00000003-0000-0000-0000-000000000001'
    const seededGroup = '00000002-0000-0000-0000-000000000001'
    const client = buildMockClient({
      rpcTotal: 1000,
      menu: [
        { id: seededItem, name: 'Krapow Daging Sahaja', price_cents: 1000, is_available: true },
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
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [
          { menu_item_id: seededItem, quantity: 1, modifier_ids: [seededModifier] },
        ],
        payment_method: 'cash',
      }) as never,
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.total_cents).toBe(1000)
  })

  it('rolls the whole order back when the payment write fails', async () => {
    const client = buildMockClient({
      rpcError: { message: 'forced_payment_failure', code: 'P0001' },
    })
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: KICKAPOO, quantity: 1 }],
        payment_method: 'cash',
      }) as never,
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/not created/i)
    // The attempted number is the only durable trace of the cash sale.
    expect(body.order_number).toMatch(/^MK/)

    // The RPC owns the transaction, so there is nothing to compensate with.
    expect(client.rpcCalls).toHaveLength(1)
    expect(client.calls.find((c) => c.op === 'insert')).toBeUndefined()
    expect(client.calls.find((c) => c.op === 'delete')).toBeUndefined()
  })

  it('returns the exact RPC code when one error code prefixes another', async () => {
    // `invalid_order` prefixes `invalid_order_number`, and `invalid_item`
    // prefixes `invalid_items`; the mapping must not truncate them.
    for (const [message, code] of [
      ['invalid_order_number', 'invalid_order_number'],
      ['invalid_items', 'invalid_items'],
    ]) {
      const client = buildMockClient({ rpcError: { message, code: 'P0001' } })
      requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

      const res = await POST(
        makeRequest({
          items: [{ menu_item_id: KICKAPOO, quantity: 1 }],
          payment_method: 'cash',
        }) as never,
      )

      expect(res.status).toBe(400)
      expect((await res.json()).code).toBe(code)
    }
  })

  it('merges duplicate item rows before pricing', async () => {
    const client = buildMockClient({ rpcTotal: 750 })
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [
          { menu_item_id: KICKAPOO, quantity: 1 },
          { menu_item_id: KICKAPOO, quantity: 2 },
        ],
        payment_method: 'qr_pay',
      }) as never,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.total_cents).toBe(750) // 3 x RM2.50

    const rpcItems = client.rpcCalls[0].args.p_items as Array<Record<string, unknown>>
    expect(rpcItems).toHaveLength(1)
    expect(rpcItems[0]).toMatchObject({ menu_item_id: KICKAPOO, quantity: 3 })
  })

  it('rejects unavailable menu items', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SOLD_OUT, quantity: 1 }],
        payment_method: 'cash',
      }) as never,
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/unavailable/i)
    expect(body.items).toContain('Sold Out Item')
  })

  it('rejects invalid payloads (zod)', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({ items: [], payment_method: 'credit_card' }) as never,
    )
    expect(res.status).toBe(400)
  })

  it('rejects empty item list', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({ items: [], payment_method: 'cash' }) as never,
    )
    expect(res.status).toBe(400)
  })

  it('creates a dine-in order with the table snapshot and pax', async () => {
    const client = buildMockClient({ rpcTotal: 1250, rpcTableLabel: 'T7' })
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        payment_method: 'qr_pay',
        order_type: 'dine_in',
        table_id: TABLE_ID,
        pax: 4,
      }) as never,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({
      order_type: 'dine_in',
      table_label: 'T7',
      pax: 4,
      total_cents: 1250,
      display_code: 'MK-001',
    })

    expect(client.rpcCalls[0].args.p_order).toMatchObject({
      order_type: 'dine_in',
      table_id: TABLE_ID,
      pax: 4,
      customer_name: null,
      payment_method: 'qr_pay',
    })
  })

  it('requires a table and pax for dine-in', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const noTable = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        payment_method: 'cash',
        order_type: 'dine_in',
        pax: 2,
      }) as never,
    )
    expect(noTable.status).toBe(400)

    const noPax = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        payment_method: 'cash',
        order_type: 'dine_in',
        table_id: TABLE_ID,
      }) as never,
    )
    expect(noPax.status).toBe(400)
  })

  it('rejects an inactive or unknown table', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const inactive = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        payment_method: 'cash',
        order_type: 'dine_in',
        table_id: INACTIVE_TABLE_ID,
        pax: 2,
      }) as never,
    )
    expect(inactive.status).toBe(400)
    expect((await inactive.json()).error).toMatch(/not available/i)

    const unknown = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        payment_method: 'cash',
        order_type: 'dine_in',
        table_id: '99999999-9999-4999-8999-999999999999',
        pax: 2,
      }) as never,
    )
    expect(unknown.status).toBe(400)
  })

  it('rejects a request without a payment method and writes nothing', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        order_type: 'take_away',
        customer_name: 'Aina',
      }) as never,
    )
    expect(res.status).toBe(400)
    // Nothing may reach the kitchen unpaid: no order, no payment row.
    expect(client.rpcCalls).toHaveLength(0)
    expect(client.calls.find((c) => c.op === 'insert')).toBeUndefined()
  })

  it('creates a paid order with its payment record for the chosen method', async () => {
    const client = buildMockClient({ rpcTotal: 2500 })
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 2 }],
        order_type: 'take_away',
        customer_name: 'Aina',
        payment_method: 'qr_pay',
      }) as never,
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      status: 'paid',
      total_cents: 2500,
    })

    expect(client.rpcCalls[0].args.p_order).toMatchObject({
      order_type: 'take_away',
      customer_name: 'Aina',
      payment_method: 'qr_pay',
    })
  })

  it('rejects an unsupported payment method', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        order_type: 'take_away',
        payment_method: 'card',
      }) as never,
    )
    expect(res.status).toBe(400)
    expect(client.rpcCalls).toHaveLength(0)
  })

  it('ignores a stale pay-later flag and still creates the order paid', async () => {
    // An old POS build that still sends `payment_timing` must not be able to
    // create an unpaid ticket: unknown keys are stripped, so the order is paid
    // with the method it sent.
    const client = buildMockClient({ rpcTotal: 1250 })
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        order_type: 'take_away',
        payment_method: 'cash',
        payment_timing: 'pay_later',
      }) as never,
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ status: 'paid' })

    expect(client.rpcCalls[0].args.p_order).toMatchObject({
      order_type: 'take_away',
      payment_method: 'cash',
    })
  })

  it('tells a stale POS page to reload when it sends only payment_timing', async () => {
    // Pay-later was removed, so a POS tab loaded before the deploy sends
    // `payment_timing` and no `payment_method`. "Invalid request" would leave
    // the cashier retrying; the copy has to say what actually fixes it.
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        order_type: 'take_away',
        payment_timing: 'pay_later',
      }) as never,
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toMatch(/reload the pos/i)
    expect(client.rpcCalls).toHaveLength(0)
  })

  it('prices add-ons from the database and snapshots them', async () => {
    const client = buildMockClient({
      rpcTotal: 2900,
      modifiers: MODIFIER_ROWS,
      junctions: JUNCTION_ROWS,
      groups: GROUP_ROWS,
    })
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [
          {
            menu_item_id: SET_KRAPOW,
            quantity: 2,
            modifier_ids: [MODIFIER_ID],
            notes: 'less rice',
          },
        ],
        payment_method: 'cash',
      }) as never,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.total_cents).toBe(2900) // (1250 + 200) × 2

    expect(client.rpcCalls[0].args.p_items).toEqual([
      {
        menu_item_id: SET_KRAPOW,
        quantity: 2,
        modifier_ids: [MODIFIER_ID],
        notes: 'less rice',
      },
    ])
  })

  it('rejects a modifier that is not attached to the item', async () => {
    const client = buildMockClient({
      modifiers: [{ ...MODIFIER_ROWS[0], modifier_group_id: 'other-group' }],
      junctions: JUNCTION_ROWS,
      groups: GROUP_ROWS,
    })
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [
          {
            menu_item_id: SET_KRAPOW,
            quantity: 1,
            modifier_ids: [MODIFIER_ID],
          },
        ],
        payment_method: 'cash',
      }) as never,
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('INVALID_MODIFIER')
  })

  it('rejects a missing required add-on', async () => {
    const client = buildMockClient({
      modifiers: MODIFIER_ROWS,
      junctions: [{ ...JUNCTION_ROWS[0], is_required: true }],
      groups: GROUP_ROWS,
    })
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        payment_method: 'cash',
      }) as never,
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('REQUIRED_MODIFIER_MISSING')
  })

  it('returns 403 when the staff guard rejects', async () => {
    const { NextResponse } = await import('next/server')
    requireRoleMock.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: KICKAPOO, quantity: 1 }],
        payment_method: 'cash',
      }) as never,
    )
    expect(res.status).toBe(403)
  })
})
