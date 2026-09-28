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

type Call = { table: string; op: 'insert' | 'select'; row?: Record<string, unknown>; rows?: Record<string, unknown>[] }

function buildMockClient() {
  const calls: Call[] = []
  const client = {
    calls,
    from(table: string) {
      return {
        select() {
          return {
            in(_col: string, ids: string[]) {
              return {
                then(resolve: (v: { data: unknown; error: null }) => void) {
                  calls.push({ table, op: 'select' })
                  const data = MENU_ROWS.filter((m) => ids.includes(m.id))
                  resolve({ data, error: null })
                },
              }
            },
          }
        },
        insert(rowOrRows: Record<string, unknown> | Record<string, unknown>[]) {
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows]
          calls.push({ table, op: 'insert', rows, row: rowOrRows as Record<string, unknown> })
          return {
            select() {
              return {
                single: async () => ({
                  data: { id: 'order-uuid-1', order_number: 'MKTEST1234' },
                  error: null,
                }),
              }
            },
            then(resolve: (v: { error: null }) => void) {
              resolve({ error: null })
            },
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

    const orderInsert = client.calls.find((c) => c.table === 'orders' && c.op === 'insert')
    expect(orderInsert?.row).toMatchObject({
      source: 'counter',
      status: 'paid',
      delivery_type: 'self_pickup',
      subtotal_cents: 2750,
      total_cents: 2750,
      discount_cents: 0,
      customer_name: 'Walk-in',
    })

    const itemInsert = client.calls.find((c) => c.table === 'order_items' && c.op === 'insert')
    expect(itemInsert?.rows).toHaveLength(2)
    expect(itemInsert?.rows?.[0]).toMatchObject({
      menu_item_price_cents: 1250,
      quantity: 2,
      line_total_cents: 2500,
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

    const itemInsert = client.calls.find((c) => c.table === 'order_items' && c.op === 'insert')
    expect(itemInsert?.rows).toHaveLength(1)
    expect(itemInsert?.rows?.[0]).toMatchObject({ quantity: 3 })
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
