import { describe, expect, it } from 'vitest'
import {
  buildOrderSettleTarget,
  buildTableSettleTarget,
  buildTableSettleTargetFromOrders,
  closeBlockedMessage,
  closeTableWarning,
  isOpenDineInStatus,
  normaliseOpenOrder,
  parsePax,
  summarizeTable,
  tableQrUrl,
} from '../tables'
import type { PosOpenOrder, RestaurantTable } from '../types'

const TABLE: RestaurantTable = {
  id: 'table-1',
  label: 'T1',
  zone: 'Indoor',
  seats: 4,
  qr_token: 'a'.repeat(32),
  is_active: true,
  sort_order: 0,
}

function order(overrides: Partial<PosOpenOrder> = {}): PosOpenOrder {
  return {
    id: 'order-1',
    display_code: 'MK-001',
    status: 'paid',
    total_cents: 2000,
    created_at: '2026-10-27T10:00:00Z',
    customer_name: null,
    pax: 2,
    table_id: TABLE.id,
    table_label: TABLE.label,
    delivery_type: 'dine_in',
    ...overrides,
  }
}

describe('tableQrUrl', () => {
  it('builds an absolute table URL and trims trailing slashes', () => {
    expect(tableQrUrl('abc123', 'https://www.madkrapow.com/')).toBe(
      'https://www.madkrapow.com/t/abc123'
    )
  })

  it('encodes the token', () => {
    expect(tableQrUrl('a/b', 'http://localhost:3000')).toBe(
      'http://localhost:3000/t/a%2Fb'
    )
  })
})

describe('parsePax', () => {
  it('accepts integers in range', () => {
    expect(parsePax(2)).toBe(2)
    expect(parsePax('7')).toBe(7)
    expect(parsePax(1)).toBe(1)
    expect(parsePax(50)).toBe(50)
  })

  it('rejects non-integers and out-of-range values', () => {
    expect(parsePax(0)).toBeNull()
    expect(parsePax(51)).toBeNull()
    expect(parsePax(2.5)).toBeNull()
    expect(parsePax('')).toBeNull()
    expect(parsePax('abc')).toBeNull()
    expect(parsePax(null)).toBeNull()
  })
})

describe('isOpenDineInStatus', () => {
  it('keeps a table occupied through the kitchen flow', () => {
    for (const status of ['pending', 'paid', 'accepted', 'preparing', 'ready']) {
      expect(isOpenDineInStatus(status)).toBe(true)
    }
  })

  it('does not count terminal statuses as open', () => {
    for (const status of ['picked_up', 'delivered', 'cancelled']) {
      expect(isOpenDineInStatus(status)).toBe(false)
    }
  })
})

describe('summarizeTable', () => {
  it('reports a free table', () => {
    const summary = summarizeTable(TABLE, [])
    expect(summary.isOccupied).toBe(false)
    expect(summary.totalCents).toBe(0)
    expect(summary.canClose).toBe(false)
    expect(summary.closeBlockReason).toBe('empty')
  })

  it('sums open rounds, takes the max pax and flags unpaid orders', () => {
    const summary = summarizeTable(TABLE, [
      order({ id: 'a', status: 'paid', total_cents: 1000, pax: 2 }),
      order({ id: 'b', status: 'pending', total_cents: 500, pax: 4 }),
      order({ id: 'c', status: 'picked_up', total_cents: 9999, pax: 9 }),
    ])

    expect(summary.isOccupied).toBe(true)
    expect(summary.openOrderCount).toBe(2)
    expect(summary.totalCents).toBe(1500)
    expect(summary.pax).toBe(4)
    expect(summary.hasUnpaid).toBe(true)
    expect(summary.canClose).toBe(false)
    expect(summary.closeBlockReason).toBe('unpaid')
    // Only the paid round is "still in the kitchen" for the close warning; the
    // pending one blocks closing instead of being completed by it.
    expect(summary.kitchenActiveOrderCount).toBe(1)
  })

  it('closes a paid table the kitchen never advanced', () => {
    // Regression: the POS has no control that moves paid → preparing → ready,
    // so requiring `ready` left every pay-now table permanently unclosable.
    const summary = summarizeTable(TABLE, [
      order({ id: 'a', status: 'paid' }),
      order({ id: 'b', status: 'paid' }),
    ])
    expect(summary.canClose).toBe(true)
    expect(summary.closeBlockReason).toBeNull()
    expect(summary.kitchenActiveOrderCount).toBe(2)
  })

  it('closes a table whose kitchen tickets are still cooking', () => {
    const summary = summarizeTable(TABLE, [
      order({ id: 'a', status: 'preparing' }),
      order({ id: 'b', status: 'accepted' }),
    ])
    expect(summary.canClose).toBe(true)
    expect(summary.kitchenActiveOrderCount).toBe(2)
  })

  it('allows closing when every open order is ready', () => {
    const summary = summarizeTable(TABLE, [
      order({ id: 'a', status: 'ready' }),
      order({ id: 'b', status: 'ready' }),
    ])
    expect(summary.canClose).toBe(true)
    expect(summary.closeBlockReason).toBeNull()
    expect(summary.kitchenActiveOrderCount).toBe(0)
  })

  it('tracks the oldest open order time', () => {
    const summary = summarizeTable(TABLE, [
      order({ id: 'a', created_at: '2026-10-27T10:05:00Z' }),
      order({ id: 'b', created_at: '2026-10-27T09:55:00Z' }),
    ])
    expect(summary.oldestCreatedAt).toBe('2026-10-27T09:55:00Z')
  })
})

describe('closeBlockedMessage', () => {
  it('explains every blocker', () => {
    expect(closeBlockedMessage('empty')).toMatch(/no open orders/i)
    expect(closeBlockedMessage('unpaid')).toMatch(/collect payment/i)
    expect(closeBlockedMessage(null)).toBeNull()
  })
})

describe('closeTableWarning', () => {
  it('warns when closing would complete cooking tickets', () => {
    expect(closeTableWarning(2)).toMatch(/2 orders are still in the kitchen/i)
    expect(closeTableWarning(1)).toMatch(/1 order is still in the kitchen/i)
  })

  it('says nothing when the kitchen has finished', () => {
    expect(closeTableWarning(0)).toBeNull()
  })
})

describe('buildTableSettleTarget', () => {
  it('groups every unpaid order into one total', () => {
    const summary = summarizeTable(TABLE, [
      order({ id: 'a', status: 'pending', total_cents: 1450 }),
      order({ id: 'b', status: 'pending', total_cents: 400 }),
      order({ id: 'c', status: 'paid', total_cents: 900 }),
    ])

    expect(buildTableSettleTarget(summary)).toEqual({
      kind: 'table',
      id: TABLE.id,
      label: 'Table T1',
      context: '2 unpaid orders',
      amountCents: 1850,
      orderCount: 2,
      orderIds: ['a', 'b'],
    })
  })

  it('uses singular copy and returns null when nothing is unpaid', () => {
    const one = summarizeTable(TABLE, [
      order({ id: 'a', status: 'pending', total_cents: 1450 }),
    ])
    expect(buildTableSettleTarget(one)?.context).toBe('1 unpaid order')

    const paid = summarizeTable(TABLE, [order({ status: 'paid' })])
    expect(buildTableSettleTarget(paid)).toBeNull()
  })

  it('de-duplicates the created order when it is also in the live list', () => {
    const created = order({ id: 'new', status: 'pending', total_cents: 400 })
    const target = buildTableSettleTargetFromOrders(TABLE, [
      order({ id: 'existing', status: 'pending', total_cents: 1450 }),
      created,
      created,
    ])
    expect(target?.amountCents).toBe(1850)
    expect(target?.orderCount).toBe(2)
    expect(target?.orderIds).toEqual(['existing', 'new'])
  })

  it('ignores pending orders that are not dine-in, matching the settle RPC', () => {
    const summary = summarizeTable(TABLE, [
      order({ id: 'food', status: 'pending', total_cents: 1450 }),
      order({
        id: 'takeaway',
        status: 'pending',
        total_cents: 400,
        delivery_type: 'self_pickup',
      }),
    ])
    expect(buildTableSettleTarget(summary)).toMatchObject({
      amountCents: 1450,
      orderCount: 1,
      orderIds: ['food'],
    })
  })
})

describe('buildOrderSettleTarget', () => {
  it('labels a take-away ticket with its customer', () => {
    expect(
      buildOrderSettleTarget(
        order({
          display_code: 'MK-372',
          customer_name: 'Aina',
          total_cents: 400,
        })
      )
    ).toEqual({
      kind: 'order',
      id: 'order-1',
      label: 'MK-372',
      context: 'Take-away · Aina',
      amountCents: 400,
      orderCount: 1,
      orderIds: ['order-1'],
    })
  })

  it('falls back to Walk-in copy without a name', () => {
    expect(buildOrderSettleTarget(order()).context).toBe('Take-away')
  })
})

describe('normaliseOpenOrder', () => {
  it('moves the embedded dishes onto items', () => {
    const row = {
      ...order({ status: 'pending' }),
      order_items: [
        {
          id: 'line-1',
          menu_item_name: 'Krapow Daging',
          quantity: 2,
          line_total_cents: 2500,
          notes: null,
          order_item_modifiers: [
            { modifier_name: 'Fried Egg', modifier_price_delta_cents: 200 },
          ],
        },
      ],
    }

    const normalised = normaliseOpenOrder(row)
    expect(normalised.items).toHaveLength(1)
    expect(normalised.items?.[0].menu_item_name).toBe('Krapow Daging')
    expect('order_items' in normalised).toBe(false)
  })

  it('defaults to an empty list when the embed is missing', () => {
    expect(normaliseOpenOrder(order()).items).toEqual([])
  })
})
