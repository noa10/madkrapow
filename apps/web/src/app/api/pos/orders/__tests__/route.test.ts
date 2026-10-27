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

interface MockOptions {
  menu?: Record<string, unknown>[]
  modifiers?: Record<string, unknown>[]
  junctions?: Record<string, unknown>[]
  groups?: Record<string, unknown>[]
}

function buildMockClient(options: MockOptions = {}) {
  const calls: Call[] = []
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
            then(resolve: (v: { error: null }) => void) {
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
  }
  return client
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

  it('creates a counter order with DB-recomputed prices and a payment row', async () => {
    const client = buildMockClient()
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
    // 2 x RM12.50 + 1 x RM2.50 — recomputed from the DB, not the client.
    expect(body.total_cents).toBe(2750)
    expect(body.display_code).toBe('MK-001')

    const orderInsert = client.calls.find((c) => c.table === 'orders' && c.op === 'insert')
    expect(orderInsert?.row).toMatchObject({
      source: 'counter',
      status: 'paid',
      delivery_type: 'self_pickup',
      payment_method: 'cash',
      subtotal_cents: 2750,
      total_cents: 2750,
      discount_cents: 0,
      customer_name: 'Walk-in',
    })

    const itemInserts = client.calls.filter(
      (c) => c.table === 'order_items' && c.op === 'insert'
    )
    expect(itemInserts).toHaveLength(2)
    expect(itemInserts[0].row).toMatchObject({
      menu_item_price_cents: 1250,
      quantity: 2,
      line_total_cents: 2500,
    })
    expect(itemInserts[1].row).toMatchObject({
      menu_item_price_cents: 250,
      quantity: 1,
      line_total_cents: 250,
    })

    const paymentInsert = client.calls.find((c) => c.table === 'payments' && c.op === 'insert')
    expect(paymentInsert?.row).toMatchObject({
      method: 'cash',
      amount_cents: 2750,
      status: 'succeeded',
    })
  })

  it('merges duplicate item rows before pricing', async () => {
    const client = buildMockClient()
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

    const itemInserts = client.calls.filter(
      (c) => c.table === 'order_items' && c.op === 'insert'
    )
    expect(itemInserts).toHaveLength(1)
    expect(itemInserts[0].row).toMatchObject({ quantity: 3 })
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
    const client = buildMockClient()
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

    const orderInsert = client.calls.find((c) => c.table === 'orders' && c.op === 'insert')
    expect(orderInsert?.row).toMatchObject({
      source: 'counter',
      status: 'paid',
      delivery_type: 'dine_in',
      table_id: TABLE_ID,
      table_label: 'T7',
      pax: 4,
      customer_name: null,
      include_cutlery: false,
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

  it('creates a pay-later order with no payment record', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 2 }],
        order_type: 'take_away',
        customer_name: 'Aina',
        payment_timing: 'pay_later',
      }) as never,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toMatchObject({
      status: 'pending',
      payment_timing: 'pay_later',
      total_cents: 2500,
    })

    const orderInsert = client.calls.find((c) => c.table === 'orders' && c.op === 'insert')
    expect(orderInsert?.row).toMatchObject({
      status: 'pending',
      source: 'counter',
      delivery_type: 'self_pickup',
      payment_method: null,
      total_cents: 2500,
    })
    expect(client.calls.find((c) => c.table === 'payments')).toBeUndefined()
  })

  it('requires a payment method when paying now', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        order_type: 'take_away',
        customer_name: 'Aina',
        payment_timing: 'pay_now',
      }) as never,
    )
    expect(res.status).toBe(400)
  })

  it('rejects a payment method on a pay-later order', async () => {
    const client = buildMockClient()
    requireRoleMock.mockResolvedValue({ user: { id: 'u' }, supabase: client })

    const res = await POST(
      makeRequest({
        items: [{ menu_item_id: SET_KRAPOW, quantity: 1 }],
        order_type: 'take_away',
        customer_name: 'Aina',
        payment_timing: 'pay_later',
        payment_method: 'cash',
      }) as never,
    )
    expect(res.status).toBe(400)
  })

  it('prices add-ons from the database and snapshots them', async () => {
    const client = buildMockClient({
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

    const itemInsert = client.calls.find(
      (c) => c.table === 'order_items' && c.op === 'insert'
    )
    expect(itemInsert?.row).toMatchObject({
      menu_item_price_cents: 1250,
      quantity: 2,
      line_total_cents: 2900,
      notes: 'less rice',
    })

    const modifierInsert = client.calls.find(
      (c) => c.table === 'order_item_modifiers' && c.op === 'insert'
    )
    expect(modifierInsert?.rows).toEqual([
      {
        order_item_id: 'line-1',
        modifier_id: MODIFIER_ID,
        modifier_name: 'Fried Egg',
        modifier_price_delta_cents: 200,
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
