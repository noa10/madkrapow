import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), mark: vi.fn() }))
vi.mock('@/lib/admin/require-role', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => ({}) }))
vi.mock('@/lib/grabfood/guard', () => ({ requireGrabFoodEnabled: () => null }))
vi.mock('@/lib/grabfood/order-actions', () => ({ markGrabOrderReady: mocks.mark }))
import { POST } from '../route'

describe('Grab ready route', () => {
  beforeEach(() => { mocks.requireRole.mockResolvedValue({ user: {} }); mocks.mark.mockReset() })
  it('returns an actionable failure and forwards explicit uncertain retry', async () => {
    mocks.mark.mockResolvedValue({ ok: false, status: 502, error: 'Check Grab', uncertain: true })
    const req = new Request('http://localhost/ready', { method: 'POST', body: JSON.stringify({ retryUncertain: true }) })
    const response = await POST(req as never, { params: Promise.resolve({ id: 'o' }) })
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'Check Grab', uncertain: true })
    expect(mocks.mark).toHaveBeenCalledWith(expect.anything(), 'o', { retryUncertain: true })
  })
})
