import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enabled: true,
  claim: [{ covered_revision: 12 }] as Array<{ covered_revision: number }>,
  calls: [] as Array<[string, Record<string, unknown>]>,
  finish: true,
  claimError: null as null | { code: string; message: string },
  cleanupError: null as null | { code: string; message: string },
}))
const notify = vi.hoisted(() => vi.fn())
vi.mock('@/lib/validators/env', () => ({ env: { CRON_SECRET: 'secret', GRABFOOD_MERCHANT_ID: 'merchant' } }))
vi.mock('@/lib/grabfood/guard', () => ({ requireGrabFoodEnabled: () => state.enabled ? null : { error: 'disabled' } }))
vi.mock('@/lib/grabfood/client', () => ({ createGrabFoodClient: () => ({ notifyMenuUpdate: notify }) }))
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
  state.calls.push([name, args ?? {}])
  if (name === 'cleanup_grabfood_menu_refresh') return { data: 0, error: state.cleanupError }
  if (name === 'claim_grabfood_menu_refresh') return { data: state.claim, error: state.claimError }
  return { data: state.finish, error: null }
} }) }))
const { POST } = await import('./route')
const request = (auth = 'Bearer secret') => new Request('http://localhost/api/cron/grabfood/menu-refresh', { method: 'POST', headers: { authorization: auth } }) as Parameters<typeof POST>[0]
const argsFor = (name: string) => state.calls.find(([called]) => called === name)?.[1]

beforeEach(() => {
  state.enabled = true
  state.claim = [{ covered_revision: 12 }]
  state.calls = []
  state.finish = true
  state.claimError = null
  state.cleanupError = null
  notify.mockReset().mockResolvedValue(undefined)
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GrabFood menu refresh cron', () => {
  it('rejects unauthorized requests and does not touch the queue', async () => {
    expect((await POST(request('wrong'))).status).toBe(401)
    expect(state.calls).toHaveLength(0)
  })
  it('leaves work pending while the integration is disabled but still cleans up', async () => {
    state.enabled = false
    expect(await (await POST(request())).json()).toMatchObject({ skipped: true, reason: 'disabled' })
    expect(argsFor('cleanup_grabfood_menu_refresh')).toBeDefined()
    expect(argsFor('claim_grabfood_menu_refresh')).toBeUndefined()
    expect(notify).not.toHaveBeenCalled()
  })
  it('records notification acceptance without claiming the menu was applied', async () => {
    const result = await (await POST(request())).json()
    expect(notify).toHaveBeenCalledWith('merchant')
    expect(result).toMatchObject({ notified: true, revision: 12 })
    expect(result).not.toHaveProperty('applied')
    expect(argsFor('finish_grabfood_menu_refresh')).toMatchObject({ p_revision: 12, p_error: null })
  })
  it('retains a failure for retry', async () => {
    notify.mockRejectedValueOnce(new Error('network failure'))
    expect((await POST(request())).status).toBe(502)
    expect(argsFor('finish_grabfood_menu_refresh')).toMatchObject({ p_revision: 12, p_error: 'network failure' })
  })
  it('treats an empty error message as a failure', async () => {
    notify.mockRejectedValueOnce(new Error(''))
    expect((await POST(request())).status).toBe(502)
    expect(argsFor('finish_grabfood_menu_refresh')?.p_error).toBe('Menu notification failed')
  })
  it('reports a failed acknowledgement as retryable', async () => {
    state.finish = false
    expect((await POST(request())).status).toBe(500)
  })
  it('reports a claim error without notifying or leaking the lease token', async () => {
    state.claimError = { code: '57014', message: 'canceling statement due to statement timeout' }
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(notify).not.toHaveBeenCalled()
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ')
    expect(logged).toContain('57014')
    expect(logged).toContain('statement timeout')
    expect(logged).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })
  it('still notifies when retention cleanup fails', async () => {
    state.cleanupError = { code: 'XX000', message: 'cleanup unavailable' }
    expect((await POST(request())).status).toBe(200)
    expect(notify).toHaveBeenCalledWith('merchant')
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).toContain('cleanup unavailable')
  })
  it('does not notify when another worker holds the claim', async () => {
    state.claim = []
    expect(await (await POST(request())).json()).toMatchObject({ notified: false, skipped: true, reason: 'nothing pending' })
    expect(notify).not.toHaveBeenCalled()
  })
})
