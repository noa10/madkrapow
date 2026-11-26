import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const harness = vi.hoisted(() => ({ notify: vi.fn() }))

vi.mock('@/lib/admin/require-role', () => ({
  requireRole: async () => ({ user: { app_metadata: { role: 'admin' } }, supabase: {} }),
}))
vi.mock('@/lib/grabfood/guard', () => ({ requireGrabFoodEnabled: () => null }))
vi.mock('@/lib/validators/env', () => ({ env: { GRABFOOD_MERCHANT_ID: 'merchant-1' } }))
vi.mock('@/lib/grabfood/client', () => {
  class GrabFoodApiError extends Error {
    readonly status: number
    constructor(message: string, status: number, _path: string) {
      super(message)
      this.name = 'GrabFoodApiError'
      this.status = status
    }
  }
  return {
    GrabFoodApiError,
    createGrabFoodClient: () => ({ notifyMenuUpdate: harness.notify }),
  }
})

const { POST } = await import('../notification/route')
const { GrabFoodApiError } = await import('@/lib/grabfood/client')

function request() {
  return new NextRequest('http://localhost/api/integrations/grabfood/menu/notification', {
    method: 'POST',
  })
}

describe('Grab menu notification route', () => {
  it('reports a Grab cooldown conflict as accepted because the outbox retries', async () => {
    harness.notify.mockRejectedValue(
      new GrabFoodApiError('GrabFood API failed (409): sync menu too frequently', 409, '/partner/v1/merchant/menu/notification')
    )

    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      notified: false,
      deferred: true,
    })
  })

  it('keeps other upstream failures visible', async () => {
    harness.notify.mockRejectedValue(new GrabFoodApiError('upstream timeout', 504, '/partner/v1/merchant/menu/notification'))

    const response = await POST(request())

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Menu notification failed',
      detail: 'upstream timeout',
    })
  })
})
