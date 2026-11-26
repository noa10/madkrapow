import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { requireRole, getServiceClient, markGrabOrderReady } = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getServiceClient: vi.fn(),
  markGrabOrderReady: vi.fn(),
}))
vi.mock('@/lib/admin/require-role', () => ({ requireRole }))
vi.mock('@/lib/supabase/server', () => ({ getServiceClient }))
vi.mock('@/lib/grabfood/order-actions', () => ({ markGrabOrderReady }))

import { POST } from '../route'

const id = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ id }) }
const request = (body: unknown) =>
  new Request(`http://localhost/api/admin/orders/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never

type RpcResult = {
  ok?: boolean
  code?: string
  status?: string
  changed?: boolean
  duplicate?: boolean
  previous_status?: string
}

function setup(options: {
  role?: string
  userId?: string | null
  result?: RpcResult | null
  error?: { message: string } | null
} = {}) {
  const {
    role = 'admin',
    userId = 'staff-user',
    result = {
      ok: true,
      status: 'ready',
      changed: true,
      duplicate: false,
      previous_status: 'preparing',
    },
    error = null,
  } = options

  const rpc = vi.fn().mockResolvedValue({ data: result, error })
  // The confirmation branch must not read or write the tables itself; the RPC
  // owns the transaction. A direct query here would be a regression.
  const from = vi.fn(() => {
    throw new Error('confirmation route must not query tables directly')
  })

  requireRole.mockResolvedValue({
    user: { id: userId, app_metadata: { role } },
    supabase: { from },
  })
  getServiceClient.mockReturnValue({ rpc })

  return { rpc, from }
}

const confirmation = { status: 'ready', alreadyMarkedReadyInGrab: true }

describe('staff confirmation of Grab ready', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['admin', 'manager'])(
    'calls the atomic RPC for %s and returns the committed result',
    async (role) => {
      const { rpc, from } = setup({ role })

      const response = await POST(request(confirmation), context)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        success: true,
        status: 'ready',
        changed: true,
        duplicate: false,
      })
      expect(requireRole).toHaveBeenCalledWith(expect.anything(), [
        'admin',
        'manager',
        'kitchen',
        'cashier',
      ])
      expect(getServiceClient).toHaveBeenCalledTimes(1)
      expect(rpc).toHaveBeenCalledWith('confirm_grabfood_order_ready', {
        p_order_id: id,
        p_actor_id: 'staff-user',
      })
      expect(from).not.toHaveBeenCalled()
      expect(markGrabOrderReady).not.toHaveBeenCalled()
    }
  )

  it('reports an idempotent duplicate without inventing a change', async () => {
    setup({
      result: {
        ok: true,
        status: 'ready',
        changed: false,
        duplicate: true,
        previous_status: 'ready',
      },
    })

    const response = await POST(request(confirmation), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      status: 'ready',
      changed: false,
      duplicate: true,
      warning: 'Grab was already marked ready; no changes were needed.',
    })
  })

  it('reports a recovered claim as a real change, not a duplicate', async () => {
    setup({
      result: {
        ok: true,
        status: 'ready',
        changed: true,
        duplicate: false,
        previous_status: 'paid',
      },
    })

    const response = await POST(request(confirmation), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      status: 'ready',
      changed: true,
      duplicate: false,
    })
  })

  it.each(['cashier', 'kitchen'])('rejects %s before touching the RPC', async (role) => {
    const { rpc } = setup({ role })

    const response = await POST(request(confirmation), context)

    expect(response.status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses an attempt it cannot attribute to a staff member', async () => {
    const { rpc } = setup({ userId: null })

    const response = await POST(request(confirmation), context)

    expect(response.status).toBe(403)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects the opt-in when the requested status is not ready', async () => {
    const { rpc } = setup()

    const response = await POST(
      request({ status: 'preparing', alreadyMarkedReadyInGrab: true }),
      context
    )

    expect(response.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['not_found', 404],
    ['not_grabfood', 400],
    ['pending', 409],
    ['not_eligible', 409],
    ['in_progress', 409],
    ['actor_required', 403],
  ])('maps RPC code %s to HTTP %i', async (code, status) => {
    setup({ result: { ok: false, code } })

    const response = await POST(request(confirmation), context)

    expect(response.status).toBe(status)
    expect((await response.json()).error).toBeTruthy()
  })

  it('fails closed on an unknown RPC code', async () => {
    setup({ result: { ok: false, code: 'something_new' } })

    const response = await POST(request(confirmation), context)

    expect(response.status).toBe(500)
    expect((await response.json()).error).toBe('Could not record Grab ready confirmation.')
  })

  it('fails closed when the RPC returns no result', async () => {
    setup({ result: null })

    const response = await POST(request(confirmation), context)

    expect(response.status).toBe(500)
  })

  it('does not leak a database error when the RPC fails', async () => {
    setup({ error: { message: 'connection reset by peer' } })

    const response = await POST(request(confirmation), context)
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toEqual({ error: 'Could not record Grab ready confirmation.' })
    expect(JSON.stringify(body)).not.toContain('connection reset')
  })
})
