import { describe, expect, it } from 'vitest'
import {
  buildTablePaymentClaimPayload,
  lineTotalCents,
  mergeTableOrderItems,
  nextStepAfterCreate,
  parseStoredTableOrder,
  resolveClaimStatus,
  serializeStoredTableOrder,
  type TableOrderItemInput,
} from '../table-orders'

function item(overrides: Partial<TableOrderItemInput> = {}): TableOrderItemInput {
  return {
    menu_item_id: 'item-1',
    quantity: 1,
    modifier_ids: [],
    ...overrides,
  }
}

describe('mergeTableOrderItems', () => {
  it('merges the same item with the same options', () => {
    const merged = mergeTableOrderItems([
      item({ quantity: 1, modifier_ids: ['b', 'a'] }),
      item({ quantity: 2, modifier_ids: ['a', 'b'] }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ quantity: 3, modifier_ids: ['a', 'b'] })
  })

  it('keeps different option sets as separate lines', () => {
    const merged = mergeTableOrderItems([
      item({ modifier_ids: ['a'] }),
      item({ modifier_ids: ['b'] }),
    ])
    expect(merged).toHaveLength(2)
  })

  it('keeps different notes as separate lines', () => {
    const merged = mergeTableOrderItems([
      item({ notes: 'no chilli' }),
      item({ notes: 'extra chilli' }),
      item(),
    ])
    expect(merged).toHaveLength(3)
  })

  it('merges lines that share the same note', () => {
    const merged = mergeTableOrderItems([
      item({ quantity: 1, notes: 'no chilli' }),
      item({ quantity: 2, notes: 'no chilli' }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ quantity: 3, notes: 'no chilli' })
  })

  it('keeps different dishes separate', () => {
    const merged = mergeTableOrderItems([
      item({ menu_item_id: 'a' }),
      item({ menu_item_id: 'b' }),
    ])
    expect(merged).toHaveLength(2)
  })
})

describe('lineTotalCents', () => {
  it('adds modifier deltas before multiplying by quantity', () => {
    expect(lineTotalCents(1250, [100, 50], 2)).toBe(2800)
    expect(lineTotalCents(1250, [], 1)).toBe(1250)
    expect(lineTotalCents(0, [250], 3)).toBe(750)
  })

  it('never returns a negative line total', () => {
    // A discount modifier larger than the base price must not make the line —
    // or the order total — negative; orders.total_cents has no CHECK.
    expect(lineTotalCents(500, [-800], 1)).toBe(0)
    expect(lineTotalCents(500, [-800], 3)).toBe(0)
  })
})

describe('nextStepAfterCreate', () => {
  it('routes a QR choice to the payment step and a counter choice to success', () => {
    expect(nextStepAfterCreate('qr')).toBe('payment')
    expect(nextStepAfterCreate('counter')).toBe('success')
  })
})

describe('buildTablePaymentClaimPayload', () => {
  it('builds the claim payload with snake_case keys', () => {
    expect(
      buildTablePaymentClaimPayload({
        tableToken: 't'.repeat(32),
        idempotencyKey: 'k'.repeat(20),
      })
    ).toEqual({ table_token: 't'.repeat(32), idempotency_key: 'k'.repeat(20) })
  })
})

describe('resolveClaimStatus', () => {
  it('marks a claim with a paid status as paid', () => {
    expect(
      resolveClaimStatus('pending', { status: 'preparing', already_paid: true })
    ).toBe('paid')
  })

  it('marks already_paid as paid even when the status has not caught up', () => {
    // The ledger says the money moved; a stale `pending` must not send the
    // diner back to the payment screen.
    expect(
      resolveClaimStatus('pending', { status: 'pending', already_paid: true })
    ).toBe('paid')
  })

  it('adopts a cancelled status from a 409 instead of staying payable', () => {
    expect(resolveClaimStatus('pending', { status: 'cancelled' })).toBe(
      'cancelled'
    )
  })

  it('does not invent payment for a status it cannot read', () => {
    expect(resolveClaimStatus('pending', { status: 'refunded' })).toBe(
      'refunded'
    )
    expect(resolveClaimStatus('pending', null)).toBe('pending')
  })
})

describe('stored table order', () => {
  const SUCCESS = {
    order_id: '11111111-1111-4111-8111-111111111111',
    order_number: 'MKTEST',
    display_code: 'MK-001',
    total_cents: 2500,
    table_label: 'T3',
    pax: 2,
    status: 'pending',
    paid_at: null,
  }

  it('round-trips the created order and its claim key', () => {
    const raw = serializeStoredTableOrder({
      success: SUCCESS,
      idempotencyKey: 'k'.repeat(32),
    })
    expect(parseStoredTableOrder(raw)).toEqual({
      success: SUCCESS,
      idempotencyKey: 'k'.repeat(32),
    })
  })

  it('rejects missing, malformed and partial payloads', () => {
    expect(parseStoredTableOrder(null)).toBeNull()
    expect(parseStoredTableOrder('')).toBeNull()
    expect(parseStoredTableOrder('not json')).toBeNull()
    expect(parseStoredTableOrder('{}')).toBeNull()
    expect(
      parseStoredTableOrder(
        JSON.stringify({ success: { order_id: SUCCESS.order_id } })
      )
    ).toBeNull()
    expect(
      parseStoredTableOrder(
        JSON.stringify({ success: SUCCESS, idempotencyKey: '' })
      )
    ).toBeNull()
  })
})
