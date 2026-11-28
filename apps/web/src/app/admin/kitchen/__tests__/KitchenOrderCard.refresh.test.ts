import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement } from 'react'
import { KitchenOrderCard } from '../KitchenOrderCard'
import type { AdminOrder } from '@/hooks/useKitchenOrders'

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => [initial, vi.fn()],
}))
vi.mock('@/stores/toast', () => ({ useToastStore: () => ({ addToast: vi.fn() }) }))

function findTransition(element: unknown): ReactElement<{ onClick: () => Promise<void> }> | undefined {
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findTransition(child)
      if (found) return found
    }
  }
  if (!isValidElement<{ children?: unknown }>(element)) return undefined
  if (typeof element.type === 'function' && element.type.name === 'KitchenStatusTransitionButtons') {
    const component = element.type as (props: { children?: unknown }) => ReactElement<{ onClick: () => Promise<void> }>
    return component(element.props)
  }
  return findTransition(element.props.children)
}

function transition(
  source: 'counter' | 'grabfood',
  onStatusChange: () => void,
  status = 'preparing',
  kitchenStatus?: 'paid' | 'preparing'
) {
  const order = {
    id: 'order-1', status, source, delivery_type: 'self_pickup', kitchen_status: kitchenStatus,
    created_at: '2026-10-17T19:30:00Z', total_cents: 1250,
    delivery_fee_cents: 0, notes: null,
  } as AdminOrder
  // React state is replaced above so the action can run without a DOM.
  const card = KitchenOrderCard({ order, items: [], onStatusChange })
  const button = findTransition(card)
  if (!button) throw new Error('Missing kitchen transition button')
  return button.props.onClick()
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('kitchen status refresh', () => {
  it('refreshes immediately after a successful counter completion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'delivered' }) }))
    const refresh = vi.fn()
    await transition('counter', refresh)
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('does not refresh after a failed transition', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'failed' }) }))
    const refresh = vi.fn()
    await transition('counter', refresh)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('completes a ready counter take-away from the kitchen board', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ status: 'delivered' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const refresh = vi.fn()
    await transition('counter', refresh, 'ready')
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/orders/order-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivered' }),
    })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it.each([
    ['paid', 'preparing'],
    ['preparing', 'ready'],
  ] as const)('advances delivered pickup kitchen status from %s to %s', async (current, next) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const refresh = vi.fn()
    await transition('counter', refresh, 'delivered', current)
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/orders/order-1/kitchen-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('retains the Grab uncertain retry flow and refreshes after success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ uncertain: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { confirm: () => true })
    const refresh = vi.fn()
    await transition('grabfood', refresh)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/integrations/grabfood/orders/order-1/ready')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ retryUncertain: true })
    expect(refresh).toHaveBeenCalledOnce()
  })
})
