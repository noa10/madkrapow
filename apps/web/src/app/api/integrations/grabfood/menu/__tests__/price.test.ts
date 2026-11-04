import { beforeEach, describe, expect, it, vi } from 'vitest'

const role = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => vi.fn())
const notify = vi.hoisted(() => vi.fn())
const disabled = vi.hoisted(() => vi.fn())
vi.mock('@/lib/admin/require-role', () => ({ requireRole: role }))
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: client }))
vi.mock('@/lib/grabfood/client', () => ({ createGrabFoodClient: () => ({ notifyMenuUpdate: notify }) }))
vi.mock('@/lib/grabfood/guard', () => ({ requireGrabFoodEnabled: disabled }))
vi.mock('@/lib/validators/env', () => ({ env: { GRABFOOD_MERCHANT_ID: 'merchant' } }))

const { GET, PUT } = await import('../price/route')
const mapping = await import('../mapping/route')
const item = '5b6c0a1e-9f0d-4a1b-8c2d-3e4f5a6b7c8d'
function request(method: string, value?: unknown) {
  return new Request(`http://localhost/api/integrations/grabfood/menu/price?menu_item_id=${item}`, {
    method, ...(value === undefined ? {} : { body: JSON.stringify({ menu_item_id: item, price_cents: value }) }),
  }) as Parameters<typeof GET>[0]
}
function database(initial: Array<Record<string, unknown>>) {
  const rows = initial.map(row => ({ ...row }))
  return {
    rows,
    from() {
      let filters: Array<[string, unknown]> = []
      let operation = 'read'
      let payload: Record<string, unknown> = {}
      const builder = {
        select() { return builder },
        eq(key: string, value: unknown) { filters = [...filters, [key, value]]; return builder },
        is(key: string, value: unknown) { filters = [...filters, [key, value]]; return builder },
        update(value: Record<string, unknown>) { operation = 'update'; payload = value; return builder },
        insert(value: Record<string, unknown>) { operation = 'insert'; payload = value; return builder },
        async maybeSingle() {
          if (operation === 'insert') {
            if (rows.some(row => row.channel === payload.channel && row.menu_item_id === payload.menu_item_id)) return { data: null, error: { code: '23505', message: 'duplicate' } }
            const row = { id: 'new', external_item_id: null, ...payload }; rows.push(row); return { data: row, error: null }
          }
          const row = rows.find(row => filters.every(([key, value]) => row[key] === value))
          if (row && operation === 'update') Object.assign(row, payload)
          return { data: row ?? null, error: null }
        },
      }
      return builder
    },
  }
}
beforeEach(() => { role.mockResolvedValue({ user: { id: 'admin' } }); notify.mockReset().mockResolvedValue(undefined); disabled.mockReset().mockReturnValue(null) })
describe('GrabFood item price', () => {
  it('creates a price-only row and accepts zero', async () => {
    const db = database([]); client.mockReturnValue(db)
    expect((await PUT(request('PUT', 0))).status).toBe(200)
    expect(db.rows).toMatchObject([{ channel: 'grabfood', menu_item_id: item, price_cents: 0, external_item_id: null }])
    expect(notify).not.toHaveBeenCalled()
  })
  it('clears the override without changing mapping, snooze or another channel', async () => {
    const db = database([{ id: 'g', channel: 'grabfood', menu_item_id: item, external_item_id: 'ext', price_cents: 100, snooze_till: 'later' }, { id: 'f', channel: 'foodpanda', menu_item_id: item, price_cents: 500 }]); client.mockReturnValue(db)
    expect((await PUT(request('PUT', null))).status).toBe(200)
    expect(db.rows).toMatchObject([{ external_item_id: 'ext', price_cents: null, snooze_till: 'later' }, { price_cents: 500 }])
    expect(notify).toHaveBeenCalledOnce()
  })
  it('reports notification failure after saving', async () => {
    const db = database([{ id: 'g', channel: 'grabfood', menu_item_id: item, external_item_id: 'ext', price_cents: 100 }]); client.mockReturnValue(db); notify.mockRejectedValue(new Error('offline'))
    const res = await PUT(request('PUT', 200))
    expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ warning: expect.stringContaining('offline') }); expect(db.rows[0].price_cents).toBe(200)
  })
  it('saves while disabled and retries a failed notification without changing the price', async () => {
    const db = database([{ id: 'g', channel: 'grabfood', menu_item_id: item, external_item_id: 'ext', price_cents: 100 }]); client.mockReturnValue(db)
    disabled.mockReturnValue({ error: 'integration disabled', status: 409 })
    const response = await PUT(request('PUT', 200))
    expect(await response.json()).toMatchObject({ warning: expect.stringContaining('disabled') })
    expect(db.rows[0].price_cents).toBe(200)
    expect(notify).not.toHaveBeenCalled()
    disabled.mockReturnValue(null)
    const retry = new Request('http://localhost/api/integrations/grabfood/menu/price', { method: 'PUT', body: JSON.stringify({ menu_item_id: item, price_cents: 200, retry_notification: true }) }) as Parameters<typeof PUT>[0]
    expect((await PUT(retry)).status).toBe(200)
    expect(notify).toHaveBeenCalledOnce()
  })
  it('rejects stale edits rather than overwriting a concurrent price', async () => {
    const db = database([{ id: 'g', channel: 'grabfood', menu_item_id: item, external_item_id: 'ext', price_cents: 300 }]); client.mockReturnValue(db)
    const req = new Request('http://localhost/api/integrations/grabfood/menu/price', { method: 'PUT', body: JSON.stringify({ menu_item_id: item, price_cents: 200, expected_price_cents: 100, expected_exists: true }) }) as Parameters<typeof PUT>[0]
    expect((await PUT(req)).status).toBe(409)
    expect(db.rows[0].price_cents).toBe(300)
  })
  it('recovers a partial save when the requested price already landed', async () => {
    const db = database([{ id: 'g', channel: 'grabfood', menu_item_id: item, external_item_id: null, price_cents: 0 }]); client.mockReturnValue(db)
    const req = new Request('http://localhost/api/integrations/grabfood/menu/price', { method: 'PUT', body: JSON.stringify({ menu_item_id: item, price_cents: 0, expected_price_cents: null, expected_exists: false }) }) as Parameters<typeof PUT>[0]
    expect((await PUT(req)).status).toBe(200)
    expect(db.rows[0].price_cents).toBe(0)
  })
  it('notifies when a regular price change affects a mapped item using fallback', async () => {
    const db = database([{ id: 'g', channel: 'grabfood', menu_item_id: item, external_item_id: 'ext', price_cents: null }]); client.mockReturnValue(db)
    const req = new Request('http://localhost/api/integrations/grabfood/menu/price', { method: 'PUT', body: JSON.stringify({ menu_item_id: item, price_cents: null, update_price: false, regular_price_changed: true }) }) as Parameters<typeof PUT>[0]
    expect((await PUT(req)).status).toBe(200)
    expect(notify).toHaveBeenCalledOnce()
  })
  it('accepts seeded menu ids that Zod uuid rejects', async () => {
    const seeded = '00000004-0000-0000-0000-000000000001'
    const db = database([]); client.mockReturnValue(db)
    const req = new Request(`http://localhost/api/integrations/grabfood/menu/price?menu_item_id=${seeded}`, { method: 'PUT', body: JSON.stringify({ menu_item_id: seeded, price_cents: 0 }) }) as Parameters<typeof PUT>[0]
    expect((await PUT(req)).status).toBe(200)
    expect(db.rows[0]).toMatchObject({ menu_item_id: seeded, price_cents: 0 })
  })
  it('rejects invalid prices and unauthorized requests', async () => {
    expect((await PUT(request('PUT', -1))).status).toBe(400)
    role.mockResolvedValue({ error: new Response(null, { status: 403 }) })
    expect((await GET(request('GET'))).status).toBe(403)
  })
})

describe('GrabFood mapping isolation', () => {
  const rowId = 'a1b2c3d4-1234-4a12-8abc-123456789abc'
  it('attaches to an unmapped row and retains price and snooze', async () => {
    const db = database([{ id: rowId, channel: 'grabfood', menu_item_id: item, external_item_id: null, price_cents: 0, snooze_till: 'later' }]); client.mockReturnValue(db)
    const req = new Request('http://localhost/api/integrations/grabfood/menu/mapping', { method: 'POST', body: JSON.stringify({ menu_item_id: item, external_item_id: 'grab-id' }) }) as Parameters<typeof mapping.POST>[0]
    expect((await mapping.POST(req)).status).toBe(201)
    expect(db.rows).toMatchObject([{ external_item_id: 'grab-id', price_cents: 0, snooze_till: 'later' }])
  })
  it('applies an explicitly supplied zero price when attaching a mapping', async () => {
    const db = database([{ id: rowId, channel: 'grabfood', menu_item_id: item, external_item_id: null, price_cents: 500, snooze_till: 'later' }]); client.mockReturnValue(db)
    const req = new Request('http://localhost/api/integrations/grabfood/menu/mapping', { method: 'POST', body: JSON.stringify({ menu_item_id: item, external_item_id: 'grab-id', price_cents: 0 }) }) as Parameters<typeof mapping.POST>[0]
    expect((await mapping.POST(req)).status).toBe(201)
    expect(db.rows[0]).toMatchObject({ price_cents: 0, snooze_till: 'later' })
  })
  it('maps a seeded menu item id whose UUID version nibble is zero', async () => {
    const seeded = '00000004-0000-0000-0000-000000000001'
    const db = database([]); client.mockReturnValue(db)
    const req = new Request('http://localhost/api/integrations/grabfood/menu/mapping', { method: 'POST', body: JSON.stringify({ menu_item_id: seeded, external_item_id: 'grab-seeded' }) }) as Parameters<typeof mapping.POST>[0]
    expect((await mapping.POST(req)).status).toBe(201)
    expect(db.rows[0]).toMatchObject({ menu_item_id: seeded, external_item_id: 'grab-seeded' })
  })
  it('unmaps without deleting the price and refuses to change Foodpanda rows', async () => {
    const db = database([{ id: rowId, channel: 'foodpanda', menu_item_id: item, external_item_id: 'food-id', price_cents: 400 }]); client.mockReturnValue(db)
    const patch = new Request('http://localhost/api/integrations/grabfood/menu/mapping', { method: 'PATCH', body: JSON.stringify({ channel_product_id: rowId, price_cents: 0 }) }) as Parameters<typeof mapping.PATCH>[0]
    const unmap = () => new Request(`http://localhost/api/integrations/grabfood/menu/mapping?channel_product_id=${rowId}`, { method: 'DELETE' }) as Parameters<typeof mapping.DELETE>[0]
    expect((await mapping.PATCH(patch)).status).toBe(404)
    expect((await mapping.DELETE(unmap())).status).toBe(404)
    expect(db.rows[0]).toMatchObject({ external_item_id: 'food-id', price_cents: 400 })
    db.rows[0].channel = 'grabfood'
    expect((await mapping.DELETE(unmap())).status).toBe(200)
    expect(db.rows[0]).toMatchObject({ external_item_id: null, price_cents: 400 })
  })
})
