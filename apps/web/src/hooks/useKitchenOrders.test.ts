import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  effect: undefined as (() => void | (() => void)) | undefined,
  cleanup: undefined as (() => void) | undefined,
  handlers: {} as Record<string, (payload: { new: Record<string, unknown> }) => void>,
  requests: [] as Array<(value: { data: unknown; error: { message: string } | null }) => void>,
  signals: [] as AbortSignal[],
}))

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.index++
    if (!(index in harness.states)) harness.states[index] = initial
    return [harness.states[index], (value: unknown) => {
      harness.states[index] = typeof value === 'function' ? value(harness.states[index]) : value
    }]
  },
  useEffect: (effect: () => void | (() => void)) => {
    harness.effect = () => {
      const cleanup = effect()
      if (cleanup) harness.cleanup = cleanup
      return cleanup
    }
  },
  useRef: (initial: unknown) => {
    const index = harness.index++
    if (!(index in harness.states)) harness.states[index] = { current: initial }
    return harness.states[index]
  },
  useCallback: (callback: unknown) => callback,
}))

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => {
    const query = {
      select: () => query, or: () => query, order: () => query,
      abortSignal: (signal: AbortSignal) => { harness.signals.push(signal); return query },
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
  harness.states = []; harness.index = 0; harness.handlers = {}; harness.requests = []; harness.signals = []; harness.cleanup = undefined
  vi.stubGlobal('window', { dispatchEvent: vi.fn() })
})

afterEach(() => {
  harness.cleanup?.()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('kitchen order refresh', () => {
  it('alerts for a delivered pickup entering the queue on update and removes it on ready', async () => {
    render(); harness.effect!()
    await resolve(0, [])
    const pickup = { ...ticket('pickup', 'delivered', 'counter'), delivery_type: 'self_pickup', kitchen_status: 'paid' }
    harness.handlers.UPDATE({ new: pickup })
    expect(render().orders.map((order) => order.id)).toEqual(['pickup'])
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
    harness.handlers.UPDATE({ new: { ...pickup, kitchen_status: 'preparing' } })
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
    harness.handlers.UPDATE({ new: { ...pickup, kitchen_status: 'ready' } })
    expect(render().orders).toEqual([])
  })

  it('does not alert twice when an existing pending counter ticket is paid', async () => {
    render(); harness.effect!()
    await resolve(0, [])
    const pickup = { ...ticket('pickup', 'pending', 'counter'), delivery_type: 'self_pickup' }
    harness.handlers.INSERT({ new: pickup })
    harness.handlers.UPDATE({ new: { ...pickup, status: 'delivered', kitchen_status: 'paid' } })
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1)
  })

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

  it('reconciles a missed completion on the next periodic refresh and stops after unmount', async () => {
    vi.useFakeTimers()
    try {
      render(); const cleanup = harness.effect!() as () => void
      await resolve(0, [ticket('counter', 'preparing', 'counter')])
      await vi.advanceTimersByTimeAsync(30000)
      await resolve(1, [])
      expect(render().orders).toEqual([])
      cleanup()
      await vi.advanceTimersByTimeAsync(60000)
      expect(harness.requests).toHaveLength(2)
    } finally { vi.useRealTimers() }
  })

  it('refreshes immediately when requested after a status change', async () => {
    render(); const cleanup = harness.effect!() as () => void
    await resolve(0, [ticket('counter', 'preparing', 'counter')])
    render().refresh()
    await resolve(1, [])
    expect(render().orders).toEqual([])
    cleanup()
  })

  it('continues reconciling when a request never resolves', async () => {
    vi.useFakeTimers()
    render(); harness.effect!()
    await vi.advanceTimersByTimeAsync(30000)
    expect(harness.requests.length).toBeGreaterThan(1)
    expect(harness.signals[0].aborted).toBe(true)
    await resolve(harness.requests.length - 1, [])
    await resolve(0, [ticket('counter')])
    expect(render().orders).toEqual([])
    expect(render().hasLoaded).toBe(true)
  })

  it('reconciles again after an active realtime event overlaps a snapshot that omits the ticket', async () => {
    render(); harness.effect!()
    await resolve(0, [ticket('counter', 'preparing', 'counter')])
    render().refresh()
    harness.handlers.UPDATE({ new: ticket('counter', 'preparing', 'counter') })
    await resolve(1, [])
    expect(harness.requests).toHaveLength(3)
    await resolve(2, [])
    expect(render().orders).toEqual([])
  })

  it('ignores a response after unmount', async () => {
    render(); const cleanup = harness.effect!() as () => void
    cleanup()
    await resolve(0, [ticket('one')])
    expect(render().orders).toEqual([])
  })
})
