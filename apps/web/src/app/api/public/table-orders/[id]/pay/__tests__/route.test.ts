import { describe, expect, it, vi, beforeEach } from 'vitest'

// The route creates its service-role client per request.
const state = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => state.client,
}))

import { POST } from '../route'

const TOKEN = 'a'.repeat(32)
const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const KEY = 'k'.repeat(32)
const TABLE = { id: 'table-1', is_active: true }

function context(id = ORDER_ID) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/public/table-orders/${ORDER_ID}/pay`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  ) as unknown as Request
}

const VALID_BODY = { table_token: TOKEN, idempotency_key: KEY }

interface MockOptions {
  table?: Record<string, unknown> | null
  tableError?: { message: string } | null
  rpcResult?: unknown
  rpcError?: { message: string } | null
}

function buildClient(options: MockOptions = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: options.rpcResult ?? null,
    error: options.rpcError ?? null,
  })

  const client = {
    rpc,
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: options.table === undefined ? TABLE : options.table,
            error: options.tableError ?? null,
          }),
        }),
      }),
    }),
  }

  return { client, rpc }
}

const PAID_RESULT = {
  ok: true,
  already_paid: false,
  status: 'paid',
  amount_cents: 1250,
  payment_method: 'qr_pay',
  paid_at: '2026-10-28T10:00:00.000Z',
}

beforeEach(() => {
  state.client = null
})

describe('POST /api/public/table-orders/[id]/pay', () => {
  it('marks a pending order paid and returns the receipt fields', async () => {
    const { client, rpc } = buildClient({ rpcResult: PAID_RESULT })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({
      ok: true,
      order_id: ORDER_ID,
      status: 'paid',
      amount_cents: 1250,
      payment_method: 'qr_pay',
      paid_at: '2026-10-28T10:00:00.000Z',
      already_paid: false,
    })
    expect(rpc).toHaveBeenCalledWith('claim_table_order_payment', {
      p_order_id: ORDER_ID,
      p_table_id: TABLE.id,
      p_idempotency_key: KEY,
    })
  })

  it('returns 200 with already_paid on a retry, keeping the original method', async () => {
    const { client } = buildClient({
      rpcResult: {
        ok: true,
        already_paid: true,
        status: 'ready',
        amount_cents: 1250,
        payment_method: 'cash',
        paid_at: '2026-10-28T09:30:00.000Z',
      },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      ok: true,
      status: 'ready',
      already_paid: true,
      payment_method: 'cash',
    })
  })

  it('returns 404 when the RPC reports not_found (wrong table or secret)', async () => {
    const { client } = buildClient({
      rpcResult: { ok: false, code: 'not_found' },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Order not found' })
  })

  it('returns 409 with cancellation copy when the status is cancelled', async () => {
    const { client } = buildClient({
      rpcResult: { ok: false, code: 'not_pending', status: 'cancelled' },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.status).toBe('cancelled')
    expect(json.error).toMatch(/cancelled/i)
  })

  it('returns 409 with generic copy for a status this build does not know', async () => {
    // Today the RPC only emits `not_pending` for a cancelled order; this test
    // covers the defensive branch for a terminal status added later, so a new
    // status cannot fall through to a 200 that reads as a successful claim.
    const { client } = buildClient({
      rpcResult: { ok: false, code: 'not_pending', status: 'refunded' },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.status).toBe('refunded')
    expect(json.error).toMatch(/no longer be paid online/i)
  })

  it('returns 500 when the RPC returns a result it cannot interpret', async () => {
    // Fail closed: an empty result is not a successful claim. Reporting 200
    // here would tell the diner their payment was recorded when nothing was.
    const { client } = buildClient({ rpcResult: {} })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(500)
    expect((await res.json()).ok).toBeUndefined()
  })

  it('logs the claim code instead of dumping the whole RPC result', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = buildClient({
      rpcResult: { ok: false, code: 'unexpected_shape' },
    })
    state.client = client

    await POST(makeRequest(VALID_BODY) as never, context())

    const logged = spy.mock.calls.flat().join(' ')
    expect(logged).toContain('unexpected_shape')
    expect(logged).not.toContain('[object Object]')
    spy.mockRestore()
  })

  it('returns 404 for an inactive table token before calling the RPC', async () => {
    const { client, rpc } = buildClient({
      table: { id: TABLE.id, is_active: false },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 404 when the token resolves to no table', async () => {
    const { client, rpc } = buildClient({ table: null })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 400 when idempotency_key is missing', async () => {
    const { client, rpc } = buildClient({ rpcResult: PAID_RESULT })
    state.client = client

    const res = await POST(
      makeRequest({ table_token: TOKEN }) as never,
      context()
    )

    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-guid order id', async () => {
    const { client, rpc } = buildClient({ rpcResult: PAID_RESULT })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context('not-a-guid'))

    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 500 when the RPC fails', async () => {
    const { client } = buildClient({
      rpcError: { message: 'connection reset' },
    })
    state.client = client

    const res = await POST(makeRequest(VALID_BODY) as never, context())

    expect(res.status).toBe(500)
  })
})
