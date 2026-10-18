import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { KitchenOrderCard } from '../KitchenOrderCard'
import type { AdminOrder } from '@/hooks/useAdminOrders'
import type { KitchenItem } from '../hooks/useKitchenOrderItems'

/**
 * Renders the card to static HTML with `react-dom/server`.
 *
 * The repo has no DOM test stack (vitest runs `environment: 'node'`, no
 * testing-library), so this is the way to actually assert on rendered output
 * rather than only on extracted helpers. No jsdom is needed for static markup.
 */

const NOW = new Date('2026-10-17T19:42:00Z')
const CREATED_AT = '2026-10-17T19:30:00Z' // 12 minutes before NOW

function makeOrder(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'a3f9c1e2-4b7d-4f1a-9c3e-8d2b5a7f0e11',
    display_code: 'MK-042',
    status: 'preparing',
    total_cents: 1250,
    delivery_fee_cents: 500,
    created_at: CREATED_AT,
    delivery_address_json: {
      address_line1: '12 Jalan Ampang',
      city: 'Kuala Lumpur',
      state: 'WP',
    },
    customer_phone: '012-3456789',
    customer_name: 'Ahmad',
    delivery_type: 'delivery',
    fulfillment_type: 'asap',
    scheduled_for: null,
    notes: null,
    include_cutlery: false,
    source: 'web',
    ...overrides,
  }
}

function makeItem(overrides: Partial<KitchenItem> = {}): KitchenItem {
  return {
    id: 'i1',
    name: 'Nasi Goreng',
    quantity: 1,
    notes: null,
    modifiers: [],
    ...overrides,
  }
}

function render(
  order: AdminOrder,
  items: KitchenItem[] = [],
  options: { itemsUnavailable?: boolean } = {}
): string {
  return renderToStaticMarkup(
    createElement(KitchenOrderCard, { order, items, now: NOW, ...options })
  )
}

describe('KitchenOrderCard', () => {
  it('renders the stored display code, not the raw id', () => {
    const html = render(makeOrder())
    expect(html).toContain('MK-042')
    expect(html).not.toContain('a3f9c1e2')
  })

  it('renders every item with its quantity', () => {
    const html = render(makeOrder(), [
      makeItem({ id: 'i1', name: 'Telur Goreng', quantity: 2 }),
      makeItem({ id: 'i2', name: 'Nasi Putih Siam', quantity: 3 }),
    ])

    expect(html).toContain('Telur Goreng')
    expect(html).toContain('2x')
    expect(html).toContain('Nasi Putih Siam')
    expect(html).toContain('3x')
  })

  it('counts total dishes, not line items, in the ITEMS header', () => {
    const html = render(makeOrder(), [
      makeItem({ id: 'i1', quantity: 2 }),
      makeItem({ id: 'i2', quantity: 3 }),
    ])
    expect(html).toContain('ITEMS (5)')
  })

  it('renders addons beneath their item', () => {
    const html = render(makeOrder(), [
      makeItem({ modifiers: ['Extra Spicy', 'Add Egg'] }),
    ])
    expect(html).toContain('Extra Spicy')
    expect(html).toContain('Add Egg')
  })

  it('renders item notes', () => {
    const html = render(makeOrder(), [
      makeItem({ notes: 'Less oil please' }),
    ])
    expect(html).toContain('Note: Less oil please')
  })

  it('renders the order-level note as a callout', () => {
    const html = render(makeOrder({ notes: 'no chili please' }))
    expect(html).toContain('ORDER NOTE')
    expect(html).toContain('no chili please')
  })

  it('omits the order-note callout when there is none', () => {
    expect(render(makeOrder({ notes: null }))).not.toContain('ORDER NOTE')
  })

  it('renders the cutlery flag when cutlery is requested', () => {
    expect(render(makeOrder({ include_cutlery: true }))).toContain(
      'Cutlery requested'
    )
  })

  it('omits the cutlery flag when cutlery is not requested', () => {
    expect(render(makeOrder({ include_cutlery: false }))).not.toContain(
      'Cutlery requested'
    )
  })

  it('formats the total with sen, not truncated to whole ringgit', () => {
    // RM 12.50. The old card did `(total_cents / 100).toFixed(0)`, rendering
    // "RM 12" — this pins the fix.
    const html = render(makeOrder({ total_cents: 1250 }))
    expect(html).toContain('RM 12.50')
    expect(html).not.toContain('>RM 12<')
  })

  it('does not add the delivery fee on top of the total', () => {
    // total_cents is persisted inclusive of delivery_fee_cents.
    const html = render(
      makeOrder({ total_cents: 1250, delivery_fee_cents: 500 })
    )
    expect(html).toContain('RM 12.50')
    expect(html).not.toContain('RM 17.50')
  })

  it('labels an accepted order as Accepted, not Pending', () => {
    const html = render(makeOrder({ status: 'accepted' }))
    expect(html).toContain('Accepted')
    expect(html).not.toContain('Pending')
  })

  it('shows the delivery address for delivery orders', () => {
    const html = render(makeOrder({ delivery_type: 'delivery' }))
    expect(html).toContain('Delivery Address')
    expect(html).toContain('12 Jalan Ampang')
  })

  it('hides the address for pickup orders', () => {
    const html = render(makeOrder({ delivery_type: 'pickup' }))
    expect(html).not.toContain('Delivery Address')
    expect(html).not.toContain('Jalan Ampang')
    expect(html).not.toContain('No address')
  })

  it('renders the elapsed age alongside the clock time', () => {
    expect(render(makeOrder())).toContain('12 min ago')
  })

  it('says items are unavailable rather than implying the order is empty', () => {
    const failed = render(makeOrder(), [], { itemsUnavailable: true })
    expect(failed).toContain('Items unavailable')
    expect(failed).not.toContain('No items recorded')
  })

  it('says no items were recorded when the order genuinely has none', () => {
    const empty = render(makeOrder(), [])
    expect(empty).toContain('No items recorded')
    expect(empty).not.toContain('Items unavailable')
  })
})
