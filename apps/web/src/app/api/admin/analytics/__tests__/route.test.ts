import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn()
vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: (req: unknown) => requireAdminMock(req),
}))

import { GET } from '../route'

const today = { order_date: '2026-11-27', order_count: 6, revenue_cents: 6000, avg_order_cents: 1000, delivery_count: 2, pickup_count: 1, dine_in_count: 3 }
const historical = { order_date: '2026-01-02', order_count: 2, revenue_cents: 2500, avg_order_cents: 1250, delivery_count: 1, pickup_count: 1, dine_in_count: 0 }
const selectedItems = [{ menu_item_name: 'Selected', menu_item_id: 'id', total_quantity: 2, total_revenue_cents: 2500 }]

function authWithData(options: { cap?: number; missingCount?: boolean; rpcError?: boolean; sourceError?: boolean; sourceData?: unknown } = {}) {
  const rows = [historical, today]
  const rpc = vi.fn((name: string, args: { p_from: string; p_to: string }) => {
    if (name === 'analytics_order_sources') {
      return Promise.resolve({
        data: options.sourceData ?? [{ source: 'web', order_count: 3 }, { source: 'grabfood', order_count: 1 }],
        error: options.sourceError ? { message: 'Order sources unavailable' } : null,
      })
    }
    const result = args.p_from <= historical.order_date && args.p_to >= historical.order_date ? selectedItems : []
    return Promise.resolve({ data: { top_items: result, items_sold: result.length ? 12 : 0 }, error: options.rpcError ? { message: 'RPC unavailable' } : null })
  })
  const from = vi.fn((table: string) => {
    if (table !== 'analytics_daily_business_summary') throw new Error(`Unexpected table: ${table}`)
    let start = ''
    let end = ''
    let exact = ''
    const query = {
      select: () => query,
      gte: (_column: string, value: string) => { start = value; return query },
      lte: (_column: string, value: string) => { end = value; return query },
      eq: (_column: string, value: string) => { exact = value; return query },
      order: () => query,
      range: (first: number, last: number) => {
        const filtered = rows.filter(row => row.order_date >= start && row.order_date <= end)
        return Promise.resolve({ data: filtered.slice(first, Math.min(last + 1, first + (options.cap ?? 1000))), count: options.missingCount ? null : filtered.length, error: null })
      },
      maybeSingle: () => Promise.resolve({ data: rows.find(row => row.order_date === exact) ?? null, error: null }),
    }
    return query
  })
  return { user: { id: 'admin-user' }, supabase: { from, rpc } }
}

async function request(query = '') {
  const response = await GET(new Request(`http://localhost/api/admin/analytics${query}`) as never)
  return { response, body: await response.json() }
}

describe('GET /api/admin/analytics', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'))
    requireAdminMock.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('uses exactly seven inclusive days by default and returns today’s dine-in pulse', async () => {
    const auth = authWithData()
    requireAdminMock.mockResolvedValue(auth)
    const { response, body } = await request()
    expect(response.status).toBe(200)
    expect(auth.supabase.rpc).toHaveBeenCalledWith('analytics_top_items', { p_from: '2026-11-21', p_to: '2026-11-27' }, { count: 'exact' })
    expect(body.pulse).toMatchObject({ order_count: 6, revenue_cents: 6000, delivery_count: 2, pickup_count: 1, dine_in_count: 3 })
  })

  it.each([['30d', '2026-10-29'], ['90d', '2026-08-30']])('uses an inclusive %s preset', async (range, from) => {
    const auth = authWithData()
    requireAdminMock.mockResolvedValue(auth)
    expect((await request(`?range=${range}`)).response.status).toBe(200)
    expect(auth.supabase.rpc).toHaveBeenCalledWith('analytics_top_items', { p_from: from, p_to: '2026-11-27' }, { count: 'exact' })
  })

  it('rolls over today and presets at Malaysia midnight', async () => {
    const auth = authWithData()
    requireAdminMock.mockResolvedValue(auth)
    vi.setSystemTime(new Date('2026-11-26T16:00:00Z'))
    const { response, body } = await request()
    expect(response.status).toBe(200)
    expect(body.pulse.order_count).toBe(6)
    expect(auth.supabase.rpc).toHaveBeenCalledWith('analytics_top_items', { p_from: '2026-11-21', p_to: '2026-11-27' }, { count: 'exact' })
    vi.setSystemTime(new Date('2026-11-26T15:59:59Z'))
    await request()
    expect(auth.supabase.rpc).toHaveBeenCalledWith('analytics_top_items', { p_from: '2026-11-20', p_to: '2026-11-26' }, { count: 'exact' })
    expect(auth.supabase.rpc).toHaveBeenCalledWith('analytics_order_sources', { p_from: '2026-11-20', p_to: '2026-11-26' })
  })

  it('accepts 366 inclusive days but rejects larger custom ranges', async () => {
    requireAdminMock.mockResolvedValue(authWithData())
    expect((await request('?from=2024-01-01&to=2024-12-31')).response.status).toBe(200)
    expect((await request('?from=2024-01-01&to=2025-01-01')).response.status).toBe(400)
  })

  it('uses selected dates for top items while pulse remains today', async () => {
    requireAdminMock.mockResolvedValue(authWithData())
    const { response, body } = await request('?from=2026-01-01&to=2026-01-03')
    expect(response.status).toBe(200)
    expect(body.top_items).toEqual(selectedItems)
    expect(body.items_sold).toBe(12)
    expect(body.totals).toEqual({ order_count: 2, revenue_cents: 2500 })
    expect(body.pulse.order_count).toBe(6)
  })

  it('preserves the authorization error without querying analytics', async () => {
    requireAdminMock.mockResolvedValue({ error: new Response(null, { status: 403 }) })
    expect((await GET(new Request('http://localhost/api/admin/analytics') as never)).status).toBe(403)
  })

  it.each(['?from=2026-02-30&to=2026-03-01', '?from=0000-01-01&to=2026-01-01', '?from=2026-03-01&to=2026-02-28', '?from=2026-01-01', '?to=2026-01-01'])('rejects invalid custom dates %s', async query => {
    requireAdminMock.mockResolvedValue(authWithData())
    expect((await request(query)).response.status).toBe(400)
  })

  it('retrieves all trend rows when the server caps individual pages', async () => {
    requireAdminMock.mockResolvedValue(authWithData({ cap: 1 }))
    const { response, body } = await request('?from=2026-01-01&to=2026-11-27')
    expect(response.status).toBe(200)
    expect(body.totals).toEqual({ order_count: 8, revenue_cents: 8500 })
  })

  it('fails when a query cannot prove it returned every row', async () => {
    requireAdminMock.mockResolvedValue(authWithData({ missingCount: true }))
    expect((await request()).response.status).toBe(500)
  })

  it('fails when the top item query fails', async () => {
    requireAdminMock.mockResolvedValue(authWithData({ rpcError: true }))
    expect((await request()).response.status).toBe(500)
  })

  it('returns channel order counts for the selected range', async () => {
    const auth = authWithData()
    requireAdminMock.mockResolvedValue(auth)
    const { response, body } = await request('?from=2026-01-01&to=2026-01-03')
    expect(response.status).toBe(200)
    expect(body.sources).toEqual([{ source: 'web', order_count: 3 }, { source: 'grabfood', order_count: 1 }])
    expect(auth.supabase.rpc).toHaveBeenCalledWith('analytics_order_sources', { p_from: '2026-01-01', p_to: '2026-01-03' })
  })

  it('fails when the order source query fails', async () => {
    requireAdminMock.mockResolvedValue(authWithData({ sourceError: true }))
    expect((await request()).response.status).toBe(500)
  })

  it('fails when the order source query returns an unexpected shape', async () => {
    requireAdminMock.mockResolvedValue(authWithData({ sourceData: [{ source: 'web', order_count: '3' }] }))
    expect((await request()).response.status).toBe(500)
  })
})
