import { describe, it, expect } from 'vitest'
import { mapGrabSubmitOrder as mapWithModifierNames, planInternalTransitions } from '@/lib/grabfood/mapper'
import type { ChannelProductMapping } from '@/lib/grabfood/mapper'
import type { GrabSubmitOrderPayload } from '@/lib/grabfood/types'

const mapGrabSubmitOrder = (payload: GrabSubmitOrderPayload, mappings: Map<string, ChannelProductMapping>, orderNumber: string) =>
  mapWithModifierNames(payload, mappings, orderNumber, new Map([['mod-extra-sauce', 'Extra sauce']]))

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
    merchantID: '1-C36JLBD2PFD3LA',
    paymentType: 'CASHLESS',
    cutlery: false,
    orderTime: '2026-09-28T08:19:00+00:00',
    featureFlags: { orderAcceptedType: 'AUTO', orderType: 'DeliveredByGrab', isMexEditOrder: false },
    currency: { code: 'MYR', symbol: 'RM', exponent: 2 },
    items: [
      {
        id: 'GF-ITEM-SET-DAGING',
        grabItemID: 'grab-item-1',
        quantity: 1,
        price: 1300,
      },
      {
        id: 'GF-ITEM-POPIAH',
        grabItemID: 'grab-item-2',
        quantity: 3,
        price: 560,
        specifications: 'extra spicy',
        modifiers: [{ id: 'mod-extra-sauce', quantity: 1, price: 0 }],
      },
    ],
    price: {
      subtotal: 2980,
      merchantFundPromo: 700,
      grabFundPromo: 300,
      basketPromo: 1000,
      total: 2580,
    },
    receiver: { name: 'Ali', phones: '+60123456789' },
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
    // Specifications and readable modifier names land in notes.
    expect(items[1].notes).toContain('extra spicy')
    expect(items[1].notes).toContain('Extra sauce')

    // subtotal from price, discount = MERCHANT-funded only. basketPromo is
    // grabFundPromo + merchantFundPromo in Grab's example and must not be
    // subtracted again.
    expect(order.subtotal_cents).toBe(2980)
    expect(order.discount_cents).toBe(700)
    expect(order.total_cents).toBe(2280)

    expect(order.source).toBe('grabfood')
    expect(order.status).toBe('paid')
    expect(order.delivery_type).toBe('delivery')
    expect(order.fulfillment_type).toBe('asap')
    expect(order.include_cutlery).toBe(false)
    expect(order.customer_name).toBe('Ali')

    expect(payment).toMatchObject({
      method: 'grabfood',
      amount_cents: 2280,
      status: 'succeeded',
      external_ref: '91646057-CYUWL64UGF5XVA',
    })
    expect(channelOrder).toMatchObject({
      channel: 'grabfood',
      external_order_id: '91646057-CYUWL64UGF5XVA',
      external_order_number: 'GF-659',
      external_store_id: '1-C36JLBD2PFD3LA',
      external_status: 'ACCEPTED',
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

  it('maps CASH to a pending cash payment and scheduled takeaway correctly', () => {
    const mapped = mapGrabSubmitOrder(
      submitPayload({
        paymentType: 'CASH',
        scheduledTime: '2026-09-28T12:30:00+08:00',
        items: [{ id: 'GF-ITEM-SET-DAGING', quantity: 1, price: 1300 }],
        featureFlags: { orderAcceptedType: 'MANUAL', orderType: 'TakeAway' },
        price: { subtotal: 2980, merchantFundPromo: 0 },
      }),
      MAPPINGS,
      'MKTEST3'
    )
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) return
    expect(mapped.result.order.delivery_type).toBe('self_pickup')
    expect(mapped.result.order.fulfillment_type).toBe('scheduled')
    expect(mapped.result.order.scheduled_for).toBe('2026-09-28T12:30:00+08:00')
    expect(mapped.result.payment.method).toBe('cash')
    expect(mapped.result.payment.status).toBe('pending')
    expect(mapped.result.channelOrder.external_status).toBe('PENDING')
  })

  it('maps DineIn to the dine_in delivery type', () => {
    const mapped = mapGrabSubmitOrder(
      submitPayload({ featureFlags: { orderAcceptedType: 'AUTO', orderType: 'DineIn' } }),
      MAPPINGS,
      'MKTEST4'
    )
    expect(mapped.ok).toBe(true)
    if (!mapped.ok) return
    expect(mapped.result.order.delivery_type).toBe('dine_in')
  })

  it('reports unmapped items instead of guessing', () => {
    const payload = submitPayload({
      items: [{ id: 'GF-ITEM-UNKNOWN', quantity: 1, price: 100 }],
    })
    const mapped = mapGrabSubmitOrder(payload, MAPPINGS, 'MKTEST5')
    expect(mapped.ok).toBe(false)
    if (mapped.ok) return
    expect(mapped.unmapped).toEqual(['GF-ITEM-UNKNOWN'])
  })
})

describe('planInternalTransitions', () => {
  it.each([
    // External-only states: never move the kitchen.
    ['paid', 'ACCEPTED', []],
    ['preparing', 'ACCEPTED', []],
    ['paid', 'DRIVER_ALLOCATED', []],
    ['preparing', 'DRIVER_ARRIVED', []],
    ['preparing', 'BILL_PAID', []],
    // Collected/delivered catch the order up through the guarded chain.
    ['preparing', 'COLLECTED', ['ready', 'picked_up']],
    ['preparing', 'DELIVERED', ['ready', 'picked_up', 'delivered']],
    ['ready', 'COMPLETED', ['picked_up', 'delivered']],
    ['picked_up', 'COMPLETED', ['delivered']],
    ['delivered', 'COMPLETED', []],
    ['cancelled', 'DELIVERED', []],
    ['cancelled', 'COLLECTED', []],
    ['unknown', 'DELIVERED', []],
    ['paid', 'COLLECTED', ['preparing', 'ready', 'picked_up']],
    // Cancellation only from a cancellable state.
    ['preparing', 'CANCELLED', ['cancelled']],
    ['paid', 'FAILED', ['cancelled']],
    ['delivered', 'CANCELLED', []],
    // Unknown state.
    ['preparing', 'UnknownState', []],
    // Legacy TitleCase still parses but driver arrival stays external-only.
    ['preparing', 'DriverArrived', []],
  ])('%s + %s -> %j', (current, grabState, expected) => {
    expect(planInternalTransitions(current, { orderID: 'x', state: grabState })).toEqual(expected)
  })

  it('accepts the legacy toState field', () => {
    expect(planInternalTransitions('preparing', { orderID: 'x', toState: 'CANCELLED' })).toEqual([
      'cancelled',
    ])
  })
})
