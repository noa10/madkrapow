import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const state = vi.hoisted(() => ({
  values: [] as unknown[], index: 0,
  effect: undefined as (() => void | (() => void)) | undefined,
  requests: [] as Array<(result: { data: { external_status: string | null } | null; error: unknown }) => void>,
  filters: [] as Array<[string, unknown]>, selection: '', table: '',
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.index++
    if (!(index in state.values)) state.values[index] = initial
    return [state.values[index], (value: unknown) => { state.values[index] = value }]
  },
  useEffect: (effect: () => void | (() => void)) => { state.effect = effect },
}))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({ from: (table: string) => {
    state.table = table
    const query = {
      select: (selection: string) => { state.selection = selection; return query },
      eq: (key: string, value: unknown) => { state.filters.push([key, value]); return query },
      maybeSingle: () => new Promise((resolve) => state.requests.push(resolve)),
    }
    return query
  } }),
}))

import { GrabDeliveryStatusCard } from './GrabDeliveryStatusCard'

const render = (terminal = false) => {
  state.index = 0
  return renderToStaticMarkup(GrabDeliveryStatusCard({ orderId: 'order-1', terminal }))
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

describe('Grab delivery status', () => {
  let visibility: 'visible' | 'hidden'
  let listener: (() => void) | undefined
  beforeEach(() => {
    vi.useFakeTimers()
    state.values = []; state.requests = []; state.filters = []; state.effect = undefined
    visibility = 'visible'; listener = undefined
    vi.stubGlobal('document', {
      get visibilityState() { return visibility },
      addEventListener: (_event: string, handler: () => void) => { listener = handler },
      removeEventListener: () => { listener = undefined },
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('reads only the Grab status for this order and displays rider reassignment', async () => {
    render(); const cleanup = state.effect!() as () => void
    expect(state.table).toBe('channel_orders')
    expect(state.selection).toBe('external_status')
    expect(state.filters).toEqual([['order_id', 'order-1'], ['channel', 'grabfood']])
    state.requests[0]({ data: { external_status: 'DRIVER_ARRIVED' }, error: null }); await flush()
    expect(render()).toContain('Rider arrived')
    await vi.advanceTimersByTimeAsync(15000)
    state.requests[1]({ data: { external_status: 'DRIVER_ALLOCATED' }, error: null }); await flush()
    expect(render()).toContain('Rider assigned')
    cleanup()
  })

  it('keeps the last update visible and marks it uncertain on failure', async () => {
    render(); const cleanup = state.effect!() as () => void
    state.requests[0]({ data: { external_status: 'COLLECTED' }, error: null }); await flush()
    await vi.advanceTimersByTimeAsync(15000)
    state.requests[1]({ data: null, error: { message: 'offline' } }); await flush()
    expect(render()).toContain('Picked up')
    expect(render()).toContain('Unable to refresh')
    cleanup()
  })

  it('pauses while hidden, refreshes on return, and avoids overlapping reads', async () => {
    render(); const cleanup = state.effect!() as () => void
    await vi.advanceTimersByTimeAsync(30000)
    expect(state.requests).toHaveLength(1)
    visibility = 'hidden'; listener!()
    state.requests[0]({ data: null, error: null }); await flush()
    await vi.advanceTimersByTimeAsync(30000)
    expect(state.requests).toHaveLength(1)
    visibility = 'visible'; listener!()
    expect(state.requests).toHaveLength(2)
    cleanup()
    state.requests[1]({ data: { external_status: 'DELIVERED' }, error: null }); await flush()
    expect(render()).not.toContain('Delivered')
  })

  it('refreshes after an in-flight read when the page becomes visible', async () => {
    render(); const cleanup = state.effect!() as () => void
    visibility = 'hidden'; listener!()
    visibility = 'visible'; listener!()
    expect(state.requests).toHaveLength(1)
    state.requests[0]({ data: { external_status: 'DRIVER_ARRIVED' }, error: null }); await flush()
    expect(state.requests).toHaveLength(2)
    state.requests[1]({ data: { external_status: 'DRIVER_ALLOCATED' }, error: null }); await flush()
    expect(render()).toContain('Rider assigned')
    cleanup()
  })

  it('fetches terminal orders once and handles a missing row', async () => {
    render(true); const cleanup = state.effect!() as () => void
    state.requests[0]({ data: null, error: null }); await flush()
    expect(render(true)).toContain('No Grab delivery update available')
    await vi.advanceTimersByTimeAsync(30000)
    expect(state.requests).toHaveLength(1)
    cleanup()
  })
})
