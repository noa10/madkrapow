import { beforeEach, describe, expect, it, vi } from 'vitest'

const role = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => vi.fn())
vi.mock('@/lib/admin/require-role', () => ({ requireRole: role }))
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: client }))

const { PUT } = await import('../modifier-price/route')
const modifier = '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d'

function request(value?: unknown, extra: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/integrations/grabfood/menu/modifier-price', {
    method: 'PUT',
    body: JSON.stringify({ modifier_id: modifier, ...(value === undefined ? {} : { price_cents: value }), ...extra }),
  }) as Parameters<typeof PUT>[0]
}

function database(rows: Array<Record<string, unknown>>, options: { modifierExists?: boolean; raceOnInsert?: Record<string, unknown> } = {}) {
  const overrides = rows.map(row => ({ ...row }))
  const state = { table: '' }
  const builder = (table: string) => {
    let filters: Array<[string, unknown]> = []
    let operation = 'read'
    let payload: Record<string, unknown> = {}
    const api = {
      select() { return api },
      eq(key: string, value: unknown) { filters = [...filters, [key, value]]; return api },
      is(key: string, value: unknown) { filters = [...filters, [key, value]]; return api },
      update(value: Record<string, unknown>) { operation = 'update'; payload = value; return api },
      insert(value: Record<string, unknown>) { operation = 'insert'; payload = value; return api },
      async maybeSingle() {
        if (table === 'modifiers') {
          return { data: options.modifierExists === false ? null : { id: modifier }, error: null }
        }
        if (operation === 'insert') {
          if (options.raceOnInsert) {
            overrides.push({ id: 'race', ...options.raceOnInsert })
            return { data: null, error: { code: '23505', message: 'duplicate' } }
          }
          if (overrides.some(row => row.channel === payload.channel && row.modifier_id === payload.modifier_id)) {
            return { data: null, error: { code: '23505', message: 'duplicate' } }
          }
          const row = { id: 'new', ...payload }
          overrides.push(row)
          return { data: row, error: null }
        }
        const row = overrides.find(row => filters.every(([key, value]) => row[key] === value))
        if (row && operation === 'update') Object.assign(row, payload)
        return { data: row ?? null, error: null }
      },
    }
    return api
  }
  return { rows: overrides, from(table: string) { state.table = table; return builder(table) } }
}

beforeEach(() => { role.mockResolvedValue({ user: { id: 'admin' } }) })

describe('GrabFood modifier price', () => {
  it('creates an override and keeps zero as a real price', async () => {
    const db = database([]); client.mockReturnValue(db)
    expect((await PUT(request(0))).status).toBe(200)
    expect(db.rows).toMatchObject([{ channel: 'grabfood', modifier_id: modifier, price_cents: 0 }])
  })

  it('clears an override without deleting the row', async () => {
    const db = database([{ id: 'g', channel: 'grabfood', modifier_id: modifier, price_cents: 250 }])
    db.rows.push({ id: 'f', channel: 'foodpanda', modifier_id: modifier, price_cents: 200 })
    client.mockReturnValue(db)
    expect((await PUT(request(null))).status).toBe(200)
    expect(db.rows).toMatchObject([
      { id: 'g', price_cents: null },
      { id: 'f', price_cents: 200 },
    ])
  })

  it('does nothing when no override exists and the price is blank', async () => {
    const db = database([]); client.mockReturnValue(db)
    expect((await PUT(request(null))).status).toBe(200)
    expect(db.rows).toHaveLength(0)
  })

  it('rejects a stale edit rather than overwriting a newer price', async () => {
    const db = database([{ id: 'g', channel: 'grabfood', modifier_id: modifier, price_cents: 300 }]); client.mockReturnValue(db)
    const res = await PUT(request(200, { expected_price_cents: 150, expected_exists: true }))
    expect(res.status).toBe(409)
    expect(db.rows[0].price_cents).toBe(300)
  })

  it('updates the row when a concurrent save created it', async () => {
    const db = database([], { raceOnInsert: { channel: 'grabfood', modifier_id: modifier, price_cents: 100 } })
    client.mockReturnValue(db)
    expect((await PUT(request(200))).status).toBe(200)
    expect(db.rows).toMatchObject([{ id: 'race', price_cents: 200 }])
  })

  it('returns 404 for a modifier that does not exist', async () => {
    const db = database([], { modifierExists: false }); client.mockReturnValue(db)
    expect((await PUT(request(100))).status).toBe(404)
  })

  it('rejects invalid prices and unauthorized requests', async () => {
    expect((await PUT(request(-1))).status).toBe(400)
    role.mockResolvedValue({ error: new Response(null, { status: 403 }) })
    expect((await PUT(request(100))).status).toBe(403)
  })
})
