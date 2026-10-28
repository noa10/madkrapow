import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireRoleMock = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({
  requireRole: (req: unknown, roles: string[]) => requireRoleMock(req, roles),
}))

import { DELETE, PATCH } from '../route'

const TABLE_ID = '44444444-4444-4444-8444-444444444444'

function makeRequest(method: string, body?: unknown): Request {
  return new Request(`http://localhost/api/admin/tables/${TABLE_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

function context(id = TABLE_ID) {
  return { params: Promise.resolve({ id }) }
}

function authForUpdate(options: {
  rpcResult?: unknown
  rpcError?: unknown
  updateResult?: { data?: unknown; error?: unknown }
}) {
  const updates: Record<string, unknown>[] = []
  const events: Record<string, unknown>[] = []
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: options.rpcResult ?? null, error: options.rpcError ?? null })

  return {
    updates,
    events,
    rpc,
    user: { id: 'admin-user' },
    supabase: {
      rpc,
      from: (table: string) => ({
        update: (patch: Record<string, unknown>) => {
          updates.push(patch)
          return {
            eq: () => ({
              select: () => ({
                maybeSingle: async () =>
                  options.updateResult ?? { data: null, error: null },
              }),
            }),
          }
        },
        insert: async (row: Record<string, unknown>) => {
          if (table === 'table_events') events.push(row)
          return { error: null }
        },
      }),
    },
  }
}

const ROW = {
  id: TABLE_ID,
  label: 'Patio 2',
  zone: 'Patio',
  seats: 6,
  qr_token: 'a'.repeat(32),
  is_active: true,
  sort_order: 2,
}

describe('PATCH /api/admin/tables/[id]', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('updates the supplied fields only and records the audit event', async () => {
    const auth = authForUpdate({ updateResult: { data: ROW } })
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(
      makeRequest('PATCH', { label: 'Patio 2', seats: 6 }) as never,
      context() as never
    )

    expect(response.status).toBe(200)
    expect(auth.updates).toEqual([{ label: 'Patio 2', seats: 6 }])
    expect(auth.events).toEqual([
      {
        table_id: TABLE_ID,
        table_label: 'Patio 2',
        event_type: 'updated',
        actor_id: 'admin-user',
        details: { fields: ['label', 'seats'] },
      },
    ])
  })

  it('rejects an empty patch', async () => {
    requireRoleMock.mockResolvedValue(authForUpdate({}))
    const response = await PATCH(makeRequest('PATCH', {}) as never, context() as never)
    expect(response.status).toBe(400)
  })

  it('returns 404 when the table does not exist', async () => {
    requireRoleMock.mockResolvedValue(authForUpdate({ updateResult: { data: null } }))
    const response = await PATCH(
      makeRequest('PATCH', { label: 'Patio 3' }) as never,
      context() as never
    )
    expect(response.status).toBe(404)
  })

  it('rejects an invalid id', async () => {
    requireRoleMock.mockResolvedValue(authForUpdate({}))
    const response = await PATCH(
      makeRequest('PATCH', { is_active: false }) as never,
      context('nope') as never
    )
    expect(response.status).toBe(400)
  })

  it('refuses to deactivate a table with open orders', async () => {
    const auth = authForUpdate({ rpcResult: { ok: false, code: 'has_orders' } })
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(
      makeRequest('PATCH', { is_active: false }) as never,
      context() as never
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/open orders/i)
    expect(auth.updates).toEqual([])
    expect(auth.rpc).toHaveBeenCalledWith('deactivate_restaurant_table', {
      p_table_id: TABLE_ID,
      p_actor_id: 'admin-user',
    })
  })

  it('deactivates atomically and returns the row from the RPC', async () => {
    const deactivated = { ...ROW, is_active: false }
    const auth = authForUpdate({
      rpcResult: { ok: true, table: deactivated },
    })
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(
      makeRequest('PATCH', { is_active: false }) as never,
      context() as never
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ table: deactivated })
    // The RPC owns the write; the route must not issue a second is_active update.
    expect(auth.updates).toEqual([])
  })

  it('applies the remaining fields when deactivating in the same request', async () => {
    const auth = authForUpdate({
      rpcResult: { ok: true, table: { ...ROW, is_active: false } },
      updateResult: { data: { ...ROW, is_active: false, label: 'Patio 3' } },
    })
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(
      makeRequest('PATCH', { is_active: false, label: 'Patio 3' }) as never,
      context() as never
    )

    expect(response.status).toBe(200)
    expect(auth.updates).toEqual([{ label: 'Patio 3' }])
    expect(auth.events[0]).toMatchObject({
      event_type: 'updated',
      details: { fields: ['label'] },
    })
  })

  it('records activation', async () => {
    const auth = authForUpdate({
      updateResult: { data: { ...ROW, is_active: true } },
    })
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(
      makeRequest('PATCH', { is_active: true }) as never,
      context() as never
    )

    expect(response.status).toBe(200)
    expect(auth.updates).toEqual([{ is_active: true }])
    expect(auth.events[0]).toMatchObject({ event_type: 'activated' })
  })

  it('returns 404 when the deactivate RPC cannot find the table', async () => {
    requireRoleMock.mockResolvedValue(
      authForUpdate({ rpcResult: { ok: false, code: 'not_found' } })
    )
    const response = await PATCH(
      makeRequest('PATCH', { is_active: false }) as never,
      context() as never
    )
    expect(response.status).toBe(404)
  })
})

describe('DELETE /api/admin/tables/[id]', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  function authWithRpc(result: unknown) {
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null })
    return {
      user: { id: 'admin-user' },
      supabase: { rpc },
    }
  }

  it('blocks deletion when orders reference the table', async () => {
    const auth = authWithRpc({ ok: false, code: 'has_orders' })
    requireRoleMock.mockResolvedValue(auth)

    const response = await DELETE(makeRequest('DELETE') as never, context() as never)
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/deactivate/i)
    expect(auth.supabase.rpc).toHaveBeenCalledWith('delete_restaurant_table', {
      p_table_id: TABLE_ID,
      p_actor_id: 'admin-user',
    })
  })

  it('deletes a table with no order history', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: true }))

    const response = await DELETE(makeRequest('DELETE') as never, context() as never)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
  })

  it('returns 404 for a missing table', async () => {
    requireRoleMock.mockResolvedValue(authWithRpc({ ok: false, code: 'not_found' }))
    const response = await DELETE(makeRequest('DELETE') as never, context() as never)
    expect(response.status).toBe(404)
  })
})
