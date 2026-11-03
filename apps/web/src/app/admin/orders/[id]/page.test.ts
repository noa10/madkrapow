import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  values: [] as unknown[], index: 0, id: 'one',
  effects: [] as Array<() => void | (() => void)>,
  requests: [] as Array<(value: { data: unknown; error: { message: string } | null }) => void>,
  update: undefined as ((payload: { new: unknown }) => void) | undefined,
  paymentRequests: [] as Array<(value: { data: unknown; error: { message: string } | null }) => void>,
  deferPayment: false,
  deferShipment: false,
  shipmentRequests: [] as Array<(value: { data: unknown }) => void>,
  retryRef: { current: null as (() => void) | null },
}))
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.index++
    if (!(index in state.values)) state.values[index] = initial
    return [state.values[index], (value: unknown) => {
      state.values[index] = typeof value === 'function' ? value(state.values[index]) : value
    }]
  },
  useRef: () => state.retryRef,
  useEffect: (effect: () => void | (() => void)) => { state.effects.push(effect) },
}))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: state.id }) }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => {
    const from = (table: string) => {
      const query = {
        select: () => query, eq: () => query, order: () => query, limit: () => query,
        single: () => table === 'orders' ? new Promise((resolve) => state.requests.push(resolve)) : Promise.resolve({ data: null }),
        maybeSingle: () => table === 'payments' && state.deferPayment
          ? new Promise((resolve) => state.paymentRequests.push(resolve))
          : table === 'lalamove_shipments' && state.deferShipment
            ? new Promise((resolve) => state.shipmentRequests.push(resolve))
            : Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [] }).then(resolve),
      }
      return query
    }
    const channel = {
      on: (_type: string, filter: { table: string }, callback: (payload: { new: unknown }) => void) => {
        if (filter.table === 'orders') state.update = callback
        return channel
      },
      subscribe: () => channel,
    }
    return { from, channel: () => channel, removeChannel: vi.fn() }
  },
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))

import AdminOrderDetailPage from './page'

const order = {
  id: 'one', display_code: 'ABC', status: 'paid', source: 'grabfood',
  created_at: '2026-01-01T00:00:00Z', delivery_type: 'pickup',
  total_cents: 1000, delivery_fee_cents: 0, order_items: [],
}

const renderDetail = () => {
  const page = AdminOrderDetailPage()
  return page.type(page.props)
}

describe('order detail refresh errors', () => {
  it('does not expose order actions until payment claim status is known', () => {
    state.index = 0; state.id = 'one'
    state.values = [order, null, false, null, [], null, null]
    const view = renderDetail()
    expect(view.type).toBe('div')
    expect(view.props.children[2].type).toBe('fieldset')
    expect(view.props.children[2].props.disabled).toBe(true)
  })

  it('keys the detail view by order id so related state is reset on navigation', () => {
    state.id = 'one'; const first = AdminOrderDetailPage()
    state.id = 'two'; const second = AdminOrderDetailPage()
    expect(first.key).toBe('one')
    expect(second.key).toBe('two')
    state.id = 'one'
  })

  it('ignores an in-flight shipment poll after the detail view is removed', async () => {
    vi.useFakeTimers()
    try {
      const shipment = { dispatch_status: 'in_transit' }
      state.index = 0; state.values = [order, shipment, false, null, [], null, false]; state.effects = []
      state.shipmentRequests = []; state.deferShipment = true
      renderDetail()
      const cleanup = state.effects[1]() as () => void
      await vi.advanceTimersByTimeAsync(5000)
      cleanup()
      state.shipmentRequests[0]({ data: { dispatch_status: 'completed' } })
      await Promise.resolve()
      expect(state.values[1]).toEqual(shipment)
    } finally { state.deferShipment = false; vi.useRealTimers() }
  })

  it('blocks the loaded view when a payment claim lookup fails', async () => {
    state.index = 0; state.values = []; state.effects = []; state.requests = []; state.paymentRequests = []; state.deferPayment = true
    renderDetail()
    const cleanup = state.effects[0]() as () => void
    state.requests[0]({ data: order, error: null })
    for (let i = 0; i < 8; i++) await Promise.resolve()
    state.paymentRequests[0]({ data: null, error: { message: 'offline' } })
    for (let i = 0; i < 4; i++) await Promise.resolve()
    state.index = 0
    const view = renderDetail()
    expect(view.type).toBe('div')
    expect(view.props.children[2].props.disabled).toBe(true)
    expect(state.values[7]).toContain('Unable to verify payment')
    cleanup(); state.deferPayment = false
  })

  it('keeps the order visible and actions disabled through a failed realtime claim check and retry', async () => {
    state.index = 0; state.id = 'one'; state.values = [order, null, false, null, [], null, false]; state.effects = []
    state.requests = []; state.paymentRequests = []; state.deferPayment = true
    renderDetail(); const cleanup = state.effects[0]() as () => void
    state.update!({ new: { ...order, source: 'web', status: 'preparing' } })
    state.index = 0; let view = renderDetail()
    expect(view.type).toBe('div')
    expect(view.props.children[2].props.disabled).toBe(true)
    state.paymentRequests[0]({ data: null, error: { message: 'offline' } })
    await Promise.resolve()
    state.index = 0; view = renderDetail()
    expect(view.props.children[2].props.disabled).toBe(true)
    view.props.children[1].props.children[1].props.onClick()
    state.paymentRequests[1]({ data: null, error: null })
    await Promise.resolve()
    state.index = 0; view = renderDetail()
    expect(view.props.children[2].props.disabled).toBe(false)
    cleanup(); state.deferPayment = false
  })

  it('does not show the previous order after navigating to another id', () => {
    state.index = 0; state.id = 'two'
    state.values = [order, null, false, 'offline', [], null, false]
    expect(renderDetail().type).not.toBe('div')
    state.id = 'one'
  })

  it.each([true, false])('accepts an older successful snapshot when the newer refresh fails (failure first: %s)', async (failureFirst) => {
    state.index = 0; state.id = 'one'; state.values = []; state.effects = []; state.requests = []
    renderDetail()
    const cleanup = state.effects[0]() as () => void
    state.update!({ new: { ...order, status: 'preparing' } })
    if (failureFirst) { state.requests[1]({ data: null, error: { message: 'offline' } }); await Promise.resolve() }
    state.requests[0]({ data: order, error: null })
    for (let i = 0; i < 8; i++) await Promise.resolve()
    if (!failureFirst) { state.requests[1]({ data: null, error: { message: 'offline' } }); await Promise.resolve() }
    expect(state.values[0]).toMatchObject({ id: 'one', status: 'preparing' })
    expect(state.values[2]).toBe(false)
    cleanup()
  })

  it('keeps a loaded order visible after a refresh fails', () => {
    state.index = 0
    state.values = [order, null, false, 'offline', [], null, false]
    const result = renderDetail()
    expect(result.type).toBe('div')
  })
})
