import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ candidate: {} as Record<string, unknown>, fresh: {} as Record<string, unknown>, claimed: true, updates: [] as unknown[], filters: [] as unknown[] }))
const push = vi.hoisted(() => vi.fn())
vi.mock('@/lib/validators/env', () => ({ env: { CRON_SECRET: 'test', GRABFOOD_ENABLED: true, GRABFOOD_ENV: 'mock', GRABFOOD_MERCHANT_ID: 'merchant' } }))
vi.mock('@/lib/grabfood/client', () => ({ createGrabFoodClient: () => ({ updateMenuRecord: push }) }))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => ({
    rpc: async () => ({ data: state.claimed, error: null }),
    from: () => {
      let updating = false
      const builder = {
        select: () => builder,
        eq: () => builder,
        or: (filter: string) => { state.filters.push(filter); return builder },
        limit: async () => ({ data: [state.candidate], error: null }),
        maybeSingle: async () => ({ data: state.fresh, error: null }),
        update: (patch: unknown) => { updating = true; state.updates.push(patch); return builder },
        then: (resolve: (value: unknown) => void) => resolve({ data: updating ? null : state.fresh, error: null }),
      }
      return builder
    },
  }),
}))
const { POST } = await import('./route')
const request = () => new Request('http://localhost/api/cron/grabfood/menu-restore', { method: 'POST', headers: { authorization: 'Bearer test' } }) as Parameters<typeof POST>[0]
const row = () => ({ id: 'cp', external_item_id: 'item', external_name: null, price_cents: null, is_available: true, snooze_till: null, menu_items: { id: 'local', name: 'Dish', price_cents: 100, is_available: true, snooze_till: null } })

beforeEach(() => { state.candidate = row(); state.fresh = row(); state.claimed = true; state.updates = []; state.filters = []; push.mockReset().mockResolvedValue(undefined) })

describe('menu restore worker', () => {
  it('includes manual restores and clears pending only after a successful push', async () => {
    const result = await (await POST(request())).json()
    expect(state.filters[0]).toContain('snooze_till.is.null')
    expect(push).toHaveBeenCalledOnce()
    expect(result.restored).toEqual(['item'])
    expect(state.updates).toContainEqual({ snooze_restore_required: false })
  })
  it('rechecks the snooze after claiming and skips an extension', async () => {
    state.fresh = { ...row(), snooze_till: '2099-01-01T00:00:00Z' }
    await POST(request())
    expect(push).not.toHaveBeenCalled()
    expect(state.updates).not.toContainEqual({ snooze_restore_required: false })
  })
  it('keeps a longer master snooze pending until its expiry', async () => {
    state.fresh = { ...row(), menu_items: { ...row().menu_items, snooze_till: '2099-01-01T00:00:00Z' } }
    await POST(request())
    expect(push).toHaveBeenCalledOnce()
    expect(state.updates).toContainEqual({ grab_menu_restore_after: '2099-01-01T00:00:00Z' })
    expect(state.updates).not.toContainEqual({ snooze_restore_required: false })
  })
  it('retains failed work and skips items claimed by another worker', async () => {
    push.mockRejectedValueOnce(new Error('failed'))
    const result = await (await POST(request())).json()
    expect(result.failed).toHaveLength(1)
    expect(state.updates).not.toContainEqual({ snooze_restore_required: false })
    state.claimed = false
    push.mockClear()
    await POST(request())
    expect(push).not.toHaveBeenCalled()
  })
})
