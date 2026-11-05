import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAdminMock = vi.fn()
vi.mock('@/lib/admin/require-admin', () => ({
  requireAdmin: (req: unknown) => requireAdminMock(req),
}))

import { GET } from '../route'

function authWithTrends(trends: Record<string, unknown>[]) {
  return {
    user: { id: 'admin-user' },
    supabase: {
      from: (table: string) => {
        const query = {
          select: () => query,
          gte: () => query,
          lte: () => query,
          order: () => Promise.resolve({ data: trends, error: null }),
          limit: () => Promise.resolve({ data: [], error: null }),
        }
        if (table !== 'daily_order_summary' && table !== 'top_selling_items') {
          throw new Error(`Unexpected table: ${table}`)
        }
        return query
      },
    },
  }
}

describe('GET /api/admin/analytics', () => {
  beforeEach(() => {
    requireAdminMock.mockReset()
  })

  it('exposes dine-in in the pulse so delivery, pickup and dine-in reconcile', async () => {
    const today = new Date().toISOString().split('T')[0]
    requireAdminMock.mockResolvedValue(
      authWithTrends([
        {
          order_date: today,
          order_count: 6,
          revenue_cents: 6000,
          avg_order_cents: 1000,
          delivery_count: 2,
          pickup_count: 1,
          dine_in_count: 3,
        },
      ])
    )

    const response = await GET(new Request('http://localhost/api/admin/analytics') as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.pulse).toMatchObject({
      order_count: 6,
      delivery_count: 2,
      pickup_count: 1,
      dine_in_count: 3,
    })
    expect(
      body.pulse.delivery_count + body.pulse.pickup_count + body.pulse.dine_in_count
    ).toBe(body.pulse.order_count)
  })
})
