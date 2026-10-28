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

function updateClient(result: { data?: unknown; error?: unknown }, openOrders = 0) {
  const updates: Record<string, unknown>[] = []
  return {
    updates,
    user: { id: 'admin-user' },
    supabase: {
      from: (table: string) => {
        if (table === 'orders') {
          return {
            select: () => ({
              eq: () => ({
                in: async () => ({ count: openOrders, error: null }),
              }),
            }),
          }
        }
        return {
          update: (patch: Record<string, unknown>) => {
            updates.push(patch)
            return {
              eq: () => ({
                select: () => ({
                  maybeSingle: async () => ({
                    data: result.data ?? null,
                    error: result.error ?? null,
                  }),
                }),
              }),
            }
          },
        }
      },
    },
  }
}

describe('PATCH /api/admin/tables/[id]', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  it('updates the supplied fields only', async () => {
    const auth = updateClient({
      data: {
        id: TABLE_ID,
        label: 'Patio 2',
        zone: 'Patio',
        seats: 6,
        qr_token: 'a'.repeat(32),
        is_active: true,
        sort_order: 2,
      },
    })
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(
      makeRequest('PATCH', { label: 'Patio 2', seats: 6 }) as never,
      context() as never
    )

    expect(response.status).toBe(200)
    expect(auth.updates).toEqual([{ label: 'Patio 2', seats: 6 }])
  })

  it('rejects an empty patch', async () => {
    requireRoleMock.mockResolvedValue(updateClient({ data: null }))
    const response = await PATCH(makeRequest('PATCH', {}) as never, context() as never)
    expect(response.status).toBe(400)
  })

  it('returns 404 when the table does not exist', async () => {
    requireRoleMock.mockResolvedValue(updateClient({ data: null }))
    const response = await PATCH(
      makeRequest('PATCH', { is_active: false }) as never,
      context() as never
    )
    expect(response.status).toBe(404)
  })

  it('rejects an invalid id', async () => {
    requireRoleMock.mockResolvedValue(updateClient({ data: null }))
    const response = await PATCH(
      makeRequest('PATCH', { is_active: false }) as never,
      context('nope') as never
    )
    expect(response.status).toBe(400)
  })

  it('refuses to deactivate a table with open orders', async () => {
    const auth = updateClient({ data: null }, 2)
    requireRoleMock.mockResolvedValue(auth)

    const response = await PATCH(
      makeRequest('PATCH', { is_active: false }) as never,
      context() as never
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/open orders/i)
    expect(auth.updates).toEqual([])
  })
})

describe('DELETE /api/admin/tables/[id]', () => {
  beforeEach(() => {
    requireRoleMock.mockReset()
  })

  function authWithRpc(result: unknown) {
    return {
      user: { id: 'admin-user' },
      supabase: { rpc: vi.fn().mockResolvedValue({ data: result, error: null }) },
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
