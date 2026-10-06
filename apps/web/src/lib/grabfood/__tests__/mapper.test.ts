import { describe, it, expect } from 'vitest'
import { mapGrabSubmitOrder, planInternalTransitions } from '@/lib/grabfood/mapper'
import type { ChannelProductMapping } from '@/lib/grabfood/mapper'
import type { GrabSubmitOrderPayload } from '@/lib/grabfood/types'

const MAPPINGS = new Map<string, ChannelProductMapping>([
  [
    'GF-ITEM-SET-DAGING',
    { external_item_id: 'GF-ITEM-SET-DAGING', menu_item_id: 'menu-uuid-1', external_name: 'Set Krapow Daging' },
  ],
  [
    'GF-ITEM-POPIAH',
    { external_item_id: 'GF-ITEM-POPIAH', menu_item_id: 'menu-uuid-2', external_name: 'Popiah Krapow Daging' },
  ],
])

function submitPayload(overrides: Partial<GrabSubmitOrderPayload> = {}): GrabSubmitOrderPayload {
  return {
    orderID: '91646057-CYUWL64UGF5XVA',
    shortOrderNumber: 'GF-659',
    merchantID: 'C36JLBD2PFD3LA',
    paymentType: 'CASHLESS',
    cutlery: false,
    orderTime: '2026-09-28T08:19:00+00:00',
    items: [
      {
        itemID: 'grab-item-1',
        merchantItemID: 'GF-ITEM-SET-DAGING',
        name: 'Set Krapow Daging',
        quantity: 1,
        price: 1300,
      },
      {
        itemID: 'grab-item-2',
        merchantItemID: 'GF-ITEM-POPIAH',
        name: 'Popiah Krapow Daging',
        quantity: 3,
        price: 560,
        specifications: 'extra spicy',
        modifiers: [{ name: 'Extra Sauce', quantity: 1 }],
      },
    ],
    price: {
      subtotal: 2980,
      merchantFundPromo: 700,
      grabFundPromo: 300,
      total: 2580,
    },
    receiver: { name: 'Ali', phone: '+60123456789' },
    ...overrides,
  }
}

describe('mapGrabSubmitOrder', () => {
  it('maps items via channel_products and keeps minor-unit money', () => {
    const mapped = mapGrabSubmitOrder(submitPayload(), MAPPINGS, 'MKTEST1')
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) return

    const { order, items, payment, channelOrder } = mapped.result
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      menu_item_id: 'menu-uuid-1',
      menu_item_price_cents: 1300,
      quantity: 1,
      line_total_cents: 1300,
    })
    // specifications + modifier names land in notes
    expect(items[1].notes).toContain('extra spicy')
    expect(items[1].notes).toContain('Extra Sauce')

    // subtotal from price, discount = MERCHANT-funded only (grabFundPromo excluded)
    expect(order.subtotal_cents).toBe(2980)
    expect(order.discount_cents).toBe(700)
    expect(order.total_cents).toBe(2280)

    expect(order.source).toBe('grabfood')
    expect(order.status).toBe('paid')
    expect(order.delivery_type).toBe('delivery')
    expect(order.include_cutlery).toBe(false)
    expect(order.customer_name).toBe('Ali')

    expect(payment).toMatchObject({ method: 'grabfood', amount_cents: 2280, external_ref: '91646057-CYUWL64UGF5XVA' })
    expect(channelOrder).toMatchObject({
      channel: 'grabfood',
      external_order_id: '91646057-CYUWL64UGF5XVA',
      external_order_number: 'GF-659',
      external_store_id: 'C36JLBD2PFD3LA',
    })
  })

  it('falls back to item sums when price.subtotal is absent', () => {
    const payload = submitPayload({ price: { merchantFundPromo: 0 } })
    const mapped = mapGrabSubmitOrder(payload, MAPPINGS, 'MKTEST2')
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) return
    // 1300 + 3x560
    expect(mapped.result.order.subtotal_cents).toBe(2980)
    expect(mapped.result.order.total_cents).toBe(2980)
  })

  it('reports unmapped items instead of guessing', () => {
    const payload = submitPayload({
      items: [{ itemID: 'x', merchantItemID: 'GF-ITEM-UNKNOWN', name: '??', quantity: 1, price: 100 }],
    })
    const mapped = mapGrabSubmitOrder(payload, MAPPINGS, 'MKTEST3')
    expect(mapped.ok).toBe(false)
    if (mapped.ok) return
    expect(mapped.unmapped).toEqual(['GF-ITEM-UNKNOWN'])
  })

  it('accepts merchantItemID as the mapping key', () => {
    const payload = submitPayload({
      items: [{ itemID: 'grab-1', quantity: 1, price: 1300 }],
    })
    // no merchantItemID: the mapper falls back to itemID, which is NOT our
    // mapping key -> unmapped (channel_products are keyed by merchantItemID)
    const mapped = mapGrabSubmitOrder(payload, MAPPINGS, 'MKTEST4')
    expect(mapped.ok).toBe(false)
  })
})

describe('planInternalTransitions', () => {
  it.each([
    ['preparing', 'DriverArrived', ['ready']],
    ['preparing', 'Completed', ['ready', 'picked_up', 'delivered']],
    ['ready', 'Completed', ['picked_up', 'delivered']],
    ['picked_up', 'Completed', ['delivered']],
    ['delivered', 'Completed', []],
    ['preparing', 'DriverAssigned', []],
    ['paid', 'Accepted', []],
    ['preparing', 'Cancelled', ['cancelled']],
    ['delivered', 'Cancelled', []],
    ['preparing', 'UnknownState', []],
  ])('%s + %s -> %j', (current, grabState, expected) => {
    expect(planInternalTransitions(current, { orderID: 'x', toState: grabState })).toEqual(expected)
  })
})
