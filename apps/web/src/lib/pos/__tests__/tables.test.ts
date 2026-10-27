import { describe, expect, it } from 'vitest'
import {
  closeBlockedMessage,
  isOpenDineInStatus,
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
  })

  it('blocks closing while the kitchen is still working', () => {
    const summary = summarizeTable(TABLE, [
      order({ id: 'a', status: 'ready' }),
      order({ id: 'b', status: 'preparing' }),
    ])
    expect(summary.closeBlockReason).toBe('not_ready')
    expect(summary.canClose).toBe(false)
  })

  it('allows closing when every open order is ready', () => {
    const summary = summarizeTable(TABLE, [
      order({ id: 'a', status: 'ready' }),
      order({ id: 'b', status: 'ready' }),
    ])
    expect(summary.canClose).toBe(true)
    expect(summary.closeBlockReason).toBeNull()
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
    expect(closeBlockedMessage('not_ready')).toMatch(/ready/i)
    expect(closeBlockedMessage(null)).toBeNull()
  })
})
