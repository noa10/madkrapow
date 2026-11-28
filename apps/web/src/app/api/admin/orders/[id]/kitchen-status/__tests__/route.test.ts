import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireRoleMock = vi.fn()
const getServiceClientMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
}))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => getServiceClientMock(),
}))

import { POST } from '../route'

const id = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ id }) }
const RPC = 'advance_counter_pickup_kitchen'
type Order = { status: string; source: string; delivery_type: string; kitchen_status: string | null }
const eligible: Order = { status: 'delivered', source: 'counter', delivery_type: 'self_pickup', kitchen_status: 'paid' }

/**
 * Mirrors the orders row and the `advance_counter_pickup_kitchen` RPC from
 * migration 20261128150000: eligibility, strict paid→preparing→ready,
 * compare-and-set, and the atomic audit row.
 */
function makeDb(initial: Order | null = eligible) {
  let row = initial && { ...initial }
  let fetchError: object | null = null
  let rpcError: object | null = null
  let forcedResult: Record<string, unknown> | null = null
  let beforeRpc: (() => void) | null = null
  const events: Record<string, unknown>[] = []
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args })
    if (rpcError) return { data: null, error: rpcError }
    if (forcedResult) return { data: forcedResult, error: null }
    beforeRpc?.()
    const expected = args.p_expected as string
    const next = args.p_next as string
    const valid = (expected === 'paid' && next === 'preparing') || (expected === 'preparing' && next === 'ready')
    if (!valid) return { data: { ok: false, code: 'invalid_transition' }, error: null }
    if (!row || row.source !== 'counter' || row.delivery_type !== 'self_pickup' || row.status !== 'delivered' || row.kitchen_status === null) {
      return { data: { ok: false, code: 'not_found' }, error: null }
    }
    if (row.kitchen_status !== expected) {
      return { data: { ok: false, code: 'conflict', kitchen_status: row.kitchen_status }, error: null }
    }
    const previous = row.kitchen_status
    row = { ...row, kitchen_status: next }
    events.push({
      order_id: id,
      event_type: 'kitchen_status_changed',
      old_value: { kitchen_status: previous },
      new_value: { kitchen_status: next },
      actor_id: args.p_actor_id,
    })
    return { data: { ok: true, kitchen_status: next }, error: null }
  }

  return {
    db: {
      get row() { return row },
      events,
      rpcCalls,
      failFetch: (error: object) => { fetchError = error },
      failRpc: (error: object) => { rpcError = error },
      forceRpcResult: (result: Record<string, unknown>) => { forcedResult = result },
      runBeforeRpc: (change: () => void) => { beforeRpc = change },
      from: (table: string) => {
        if (table !== 'orders') throw new Error(`unexpected table ${table}`)
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: fetchError }),
            }),
          }),
        }
      },
    },
    rpc,
  }
}

function request(body: unknown): Request {
  return new Request('http://localhost/api/admin/orders/' + id + '/kitchen-status', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

function authorize(db = makeDb()) {
  requireRoleMock.mockResolvedValue({ user: { id: 'staff-user' }, supabase: db.db })
  getServiceClientMock.mockReturnValue({ rpc: db.rpc })
  return db
}

async function post(body: unknown) { return POST(request(body) as never, context) }

describe('POST kitchen-status', () => {
  beforeEach(() => { requireRoleMock.mockReset(); getServiceClientMock.mockReset(); vi.restoreAllMocks() })

  it('moves a paid counter pickup to preparing with an atomic audit row', async () => {
    const { db } = authorize()
    const response = await post({ status: 'preparing' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, status: 'preparing' })
    expect(db.row).toMatchObject({ status: 'delivered', kitchen_status: 'preparing' })
    expect(db.rpcCalls).toEqual([{
      fn: RPC,
      args: { p_order_id: id, p_expected: 'paid', p_next: 'preparing', p_actor_id: 'staff-user' },
    }])
    expect(db.events).toEqual([{
      order_id: id,
      event_type: 'kitchen_status_changed',
      old_value: { kitchen_status: 'paid' },
      new_value: { kitchen_status: 'preparing' },
      actor_id: 'staff-user',
    }])
  })

  it('moves a preparing counter pickup to ready', async () => {
    const { db } = authorize(makeDb({ ...eligible, kitchen_status: 'preparing' }))
    const response = await post({ status: 'ready' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, status: 'ready' })
    expect(db.rpcCalls[0].args).toMatchObject({ p_expected: 'preparing', p_next: 'ready' })
    expect(db.row?.kitchen_status).toBe('ready')
    expect(db.events).toHaveLength(1)
  })

  it('gates every staff role and returns the guard response unchanged', async () => {
    const guardResponse = Response.json({ error: 'Forbidden' }, { status: 403 })
    requireRoleMock.mockResolvedValue({ error: guardResponse })
    const response = await post({ status: 'preparing' })
    expect(response).toBe(guardResponse)
    expect(requireRoleMock).toHaveBeenCalledWith(expect.anything(), ['admin', 'manager', 'kitchen', 'cashier'])
    expect(getServiceClientMock).not.toHaveBeenCalled()
  })

  it.each([{}, { status: 'paid' }, { status: 'delivered' }, { status: null }, { status: 1 }, { status: 'PREPARING' }])('rejects invalid input %j', async body => {
    const { db } = authorize()
    expect((await post(body)).status).toBe(400)
    expect(db.rpcCalls).toEqual([])
    expect(db.row).toEqual(eligible)
    expect(db.events).toEqual([])
  })

  it('rejects malformed JSON', async () => {
    const { db } = authorize()
    const response = await POST(new Request('http://localhost', { method: 'POST', body: '{' }) as never, context)
    expect(response.status).toBe(400)
    expect(db.rpcCalls).toEqual([])
  })

  it.each([
    ['web pickup', { source: 'web' }],
    ['Grab pickup', { source: 'grabfood' }],
    ['counter delivery', { delivery_type: 'delivery' }],
    ['dine in', { delivery_type: 'dine_in' }],
    ['not completed', { status: 'paid' }],
    ['legacy completed order', { kitchen_status: null }],
  ])('rejects %s without advancing the kitchen', async (_label, change) => {
    const row = { ...eligible, ...change }
    const { db } = authorize(makeDb(row))
    expect((await post({ status: 'preparing' })).status).toBe(400)
    expect(db.rpcCalls).toEqual([])
    expect(db.row).toEqual(row)
    expect(db.events).toEqual([])
  })

  it.each([
    ['paid', 'ready'],
    ['preparing', 'preparing'],
    ['ready', 'ready'],
    ['ready', 'preparing'],
  ])('rejects the %s to %s transition', async (previous, next) => {
    const { db } = authorize(makeDb({ ...eligible, kitchen_status: previous }))
    expect((await post({ status: next })).status).toBe(400)
    expect(db.rpcCalls).toEqual([])
    expect(db.row?.kitchen_status).toBe(previous)
    expect(db.events).toEqual([])
  })

  it('returns 409 when another device advanced the ticket after the read', async () => {
    const { db } = authorize()
    db.runBeforeRpc(() => { if (db.row) db.row.kitchen_status = 'ready' })
    const response = await post({ status: 'preparing' })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/state changed/i)
    expect(db.row?.kitchen_status).toBe('ready')
    expect(db.events).toEqual([])
  })

  it('returns 409 when the order stops being an eligible counter pickup after the read', async () => {
    const { db } = authorize()
    db.runBeforeRpc(() => { if (db.row) db.row.status = 'cancelled' })
    const response = await post({ status: 'preparing' })
    expect(response.status).toBe(409)
    expect(db.events).toEqual([])
  })

  it('maps an RPC invalid-transition result to 400', async () => {
    const { db } = authorize()
    db.forceRpcResult({ ok: false, code: 'invalid_transition' })
    expect((await post({ status: 'preparing' })).status).toBe(400)
    expect(db.events).toEqual([])
  })

  it('does not leak RPC error text and reports no success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = authorize()
    db.failRpc({ message: 'private database details' })
    const response = await post({ status: 'preparing' })
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(JSON.stringify(body)).not.toContain('private database details')
    expect(db.events).toEqual([])
  })

  it('returns 500 for an unexpected RPC result', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = authorize()
    db.forceRpcResult({ ok: false, code: 'unknown_failure' })
    expect((await post({ status: 'preparing' })).status).toBe(500)
    expect(db.events).toEqual([])
  })

  it('returns 404 for an absent order', async () => {
    const { db } = authorize(makeDb(null))
    expect((await post({ status: 'preparing' })).status).toBe(404)
    expect(db.rpcCalls).toEqual([])
  })

  it('does not leak database error text when loading the order', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = authorize()
    db.failFetch({ message: 'relation "orders" secret internal detail' })
    const response = await post({ status: 'preparing' })
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('Failed to load order')
    expect(JSON.stringify(body)).not.toContain('secret internal detail')
    expect(db.rpcCalls).toEqual([])
  })
})
