import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import OrderSuccessPage from './page'

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  stateIndex: 0,
  effects: [] as Array<() => void | (() => void)>,
  orderStatus: 'cancelled' as string | null,
  orderId: 'order-123' as string | null,
  statusRequest: null as Promise<{ data: { status: string }; error: null }> | null,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.stateIndex++
      if (!(index in harness.states)) harness.states[index] = initial
      return [harness.states[index], (value: unknown) => { harness.states[index] = value }]
    },
    useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect) },
  }
})

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(harness.orderId ? { orderId: harness.orderId } : {}) }))
vi.mock('@/stores/cart', () => ({ useCartStore: () => vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => harness.statusRequest ?? { data: { status: harness.orderStatus }, error: null } }),
      }),
    }),
  }),
}))

function render() {
  harness.stateIndex = 0
  harness.effects = []
  return renderToStaticMarkup(React.createElement(OrderSuccessPage))
}

describe('order success payment status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    harness.states = []
    harness.orderStatus = 'cancelled'
    harness.orderId = 'order-123'
    harness.statusRequest = null
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows a cancelled order without confirming payment', async () => {
    render()
    const cleanup = harness.effects[3]()
    await vi.advanceTimersByTimeAsync(0)

    const html = render()
    expect(html).toContain('Order Cancelled')
    expect(html).not.toContain('Payment Confirmed!')
    if (typeof cleanup === 'function') cleanup()
  })

  it.each(['paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'])(
    'confirms a polled %s order',
    async (status) => {
      harness.orderStatus = status
      render()
      const cleanup = harness.effects[3]()
      await vi.advanceTimersByTimeAsync(0)
      expect(render()).toContain('Payment Confirmed!')
      if (typeof cleanup === 'function') cleanup()
    },
  )

  it.each(['pending', 'unknown_status', null])('does not confirm a polled %s status', async (status) => {
    harness.orderStatus = status
    render()
    const cleanup = harness.effects[3]()
    await vi.advanceTimersByTimeAsync(0)
    expect(render()).toContain('Confirming Payment')
    expect(render()).not.toContain('Payment Confirmed!')
    if (typeof cleanup === 'function') cleanup()
  })

  it.each([
    ['preparing', 'Payment Confirmed!'],
    ['cancelled', 'Order Cancelled'],
    ['pending', 'Payment Not Confirmed'],
    ['unknown_status', 'Payment Not Confirmed'],
  ])('handles verified %s without assuming every successful response means payment', async (status, heading) => {
    harness.orderStatus = 'pending'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, status }),
    }))
    render()
    const cleanup = harness.effects[3]()
    await vi.advanceTimersByTimeAsync(20000)
    const html = render()
    expect(html).toContain(heading)
    if (status !== 'preparing') expect(html).not.toContain('Payment Confirmed!')
    if (typeof cleanup === 'function') cleanup()
  })

  it('shows an uncertain result if verification fails', async () => {
    harness.orderStatus = 'pending'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Payment not completed' }) }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render()
    const cleanup = harness.effects[3]()
    await vi.advanceTimersByTimeAsync(20000)
    const html = render()
    expect(html).toContain('Payment Not Confirmed')
    expect(html).not.toContain('Payment Received')
    warn.mockRestore()
    if (typeof cleanup === 'function') cleanup()
  })

  it('continues polling while the bank processes payment and stops on cancellation', async () => {
    harness.orderStatus = 'pending'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, status: 'processing' }) }))
    render()
    const cleanup = harness.effects[3]()
    await vi.advanceTimersByTimeAsync(20000)
    expect(render()).toContain('Processing Payment')
    harness.orderStatus = 'cancelled'
    await vi.advanceTimersByTimeAsync(3000)
    expect(render()).toContain('Order Cancelled')
    await vi.advanceTimersByTimeAsync(45000)
    expect(render()).toContain('Order Cancelled')
    if (typeof cleanup === 'function') cleanup()
  })

  it('reports an uncertain result when bank processing times out', async () => {
    harness.orderStatus = 'pending'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, status: 'processing' }) }))
    render()
    const cleanup = harness.effects[3]()
    await vi.advanceTimersByTimeAsync(65000)
    const html = render()
    expect(html).toContain('Payment Not Confirmed')
    expect(html).not.toContain('Payment Confirmed!')
    expect(html).not.toContain('Payment Received')
    if (typeof cleanup === 'function') cleanup()
  })

  it('does not let a late verification overwrite a confirmed poll', async () => {
    harness.orderStatus = 'pending'
    let resolveVerification: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((resolve) => { resolveVerification = resolve })))
    render()
    const cleanup = harness.effects[3]()
    await vi.advanceTimersByTimeAsync(15000)
    let resolvePoll: (value: { data: { status: string }; error: null }) => void = () => {}
    harness.statusRequest = new Promise((resolve) => { resolvePoll = resolve })
    await vi.advanceTimersByTimeAsync(5000)
    expect(render()).toContain('Verifying Payment')
    resolvePoll({ data: { status: 'paid' }, error: null })
    await vi.advanceTimersByTimeAsync(0)
    expect(render()).toContain('Payment Confirmed!')
    resolveVerification({ ok: true, json: async () => ({ success: true, status: 'pending' }) })
    await vi.advanceTimersByTimeAsync(0)
    expect(render()).toContain('Payment Confirmed!')
    if (typeof cleanup === 'function') cleanup()
  })

  it('does not wait forever without an order id', () => {
    harness.orderId = null
    expect(render()).toContain('Payment Not Confirmed')
  })
})
