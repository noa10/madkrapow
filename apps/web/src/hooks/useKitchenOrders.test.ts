import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  effect: undefined as (() => void | (() => void)) | undefined,
  handlers: {} as Record<string, (payload: { new: Record<string, unknown> }) => void>,
  requests: [] as Array<(value: { data: unknown; error: { message: string } | null }) => void>,
}))

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.index++
    if (!(index in harness.states)) harness.states[index] = initial
    return [harness.states[index], (value: unknown) => {
      harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value
    }]
  },
  useEffect: (effect: () => void | (() => void)) => { harness.effect = effect },
}))

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => {
    const query = {
      select: () => query, or: () => query, order: () => query,
      limit: () => new Promise((resolve) => harness.requests.push(resolve)),
    }
    const channel = {
      on: (_type: string, filter: { event: string }, callback: (payload: { new: Record<string, unknown> }) => void) => {
        harness.handlers[filter.event] = callback
        return channel
      },
      subscribe: () => channel,
    }
    return { from: () => query, channel: () => channel, removeChannel: vi.fn() }
  },
}))

import { useKitchenOrders } from './useKitchenOrders'

const ticket = (id: string, status = 'paid', source = 'web') => ({ id, status, source, delivery_type: 'delivery' })
// The test harness supplies mocked React hooks and renders the hook directly.
// eslint-disable-next-line react-hooks/rules-of-hooks
const render = () => { harness.index = 0; return useKitchenOrders() }
const resolve = async (index: number, data: unknown, error: { message: string } | null = null) => {
  harness.requests[index]({ data, error })
  await Promise.resolve()
}

beforeEach(() => {
  harness.states = []; harness.index = 0; harness.handlers = {}; harness.requests = []
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
})

describe('kitchen order refresh', () => {
  it('keeps the board usable on background failure and clears the error after recovery', async () => {
    render(); harness.effect!()
    await resolve(0, [ticket('one')])
    harness.handlers.INSERT({ new: ticket('two') })
    await resolve(1, null, { message: 'offline' })
    expect(render().orders.map((order) => order.id)).toEqual(['two', 'one'])
    expect(render().loading).toBe(false)
    harness.handlers.INSERT({ new: ticket('three') })
    await resolve(2, [ticket('three'), ticket('two'), ticket('one')])
    expect(render().error).toBeNull()
  })

  it('does not overwrite newer realtime changes or newer snapshots', async () => {
    render(); harness.effect!()
    await resolve(0, [ticket('one')])
    harness.handlers.INSERT({ new: ticket('two') })
    harness.handlers.INSERT({ new: ticket('three') })
    await resolve(2, [ticket('three'), ticket('two'), ticket('one')])
    harness.handlers.UPDATE({ new: ticket('one', 'preparing') })
    await resolve(1, [ticket('two'), ticket('one')])
    expect(render().orders.map((order) => [order.id, order.status])).toEqual([
      ['three', 'paid'], ['two', 'paid'], ['one', 'preparing'],
    ])
  })

  it('does not apply a snapshot after an unrelated realtime update', async () => {
    render(); harness.effect!()
    await resolve(0, [ticket('one')])
    harness.handlers.INSERT({ new: ticket('two') })
    harness.handlers.UPDATE({ new: ticket('one', 'preparing') })
    await resolve(1, [ticket('two'), ticket('one')])
    expect(render().orders.find((order) => order.id === 'one')?.status).toBe('preparing')
  })

  it.each([true, false])('retains an initial success when a newer request fails (failure first: %s)', async (failureFirst) => {
    render(); harness.effect!()
    harness.handlers.INSERT({ new: ticket('two') })
    if (failureFirst) await resolve(1, null, { message: 'offline' })
    await resolve(0, [ticket('one')])
    if (!failureFirst) await resolve(1, null, { message: 'offline' })
    expect(render().orders.map((order) => order.id)).toEqual(['two', 'one'])
    expect(render().loading).toBe(false)
  })

  it('retries failed background refreshes and clears the warning on success', async () => {
    vi.useFakeTimers()
    try {
      render(); const cleanup = harness.effect!() as () => void
      await resolve(0, [ticket('one')])
      harness.handlers.INSERT({ new: ticket('two') })
      await resolve(1, null, { message: 'offline' })
      expect(render().error).toBe('offline')
      await vi.advanceTimersByTimeAsync(5000)
      await resolve(2, [ticket('two'), ticket('one')])
      expect(render().error).toBeNull()
      cleanup()
    } finally { vi.useRealTimers() }
  })

  it('ignores a response after unmount', async () => {
    render(); const cleanup = harness.effect!() as () => void
    cleanup()
    await resolve(0, [ticket('one')])
    expect(render().orders).toEqual([])
  })
})
