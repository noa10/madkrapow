import { describe, expect, it } from 'vitest'
import {
  buildTablePaymentClaimPayload,
  buildTablePaymentStatusPayload,
  isChangedDuplicate,
  isPayableOrder,
  isStaleLiveRead,
  lineTotalCents,
  mergeTableOrderItems,
  nextStepAfterCreate,
  parseStoredTableOrder,
  parseTableOrderStatus,
  parseTableOrderSuccess,
  parseTablePaymentClaim,
  resolveClaimOutcome,
  resolveLiveStatus,
  serializeStoredTableOrder,
  tablePaymentTone,
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

describe('resolveClaimOutcome', () => {
  it('keeps the recorded method so a cashier settlement is not shown as a QR payment', () => {
    // The cashier settled in cash; the diner then taps "I have paid" on a
    // stale screen. The screen must not say their transfer was received.
    expect(
      resolveClaimOutcome('pending', {
        status: 'paid',
        already_paid: true,
        payment_method: 'cash',
      })
    ).toEqual({ status: 'paid', paymentMethod: 'cash', alreadyPaid: true })
  })

  it('keeps qr_pay as the method for the diner’s own claim', () => {
    expect(
      resolveClaimOutcome('pending', {
        status: 'paid',
        already_paid: false,
        payment_method: 'qr_pay',
      })
    ).toEqual({ status: 'paid', paymentMethod: 'qr_pay', alreadyPaid: false })
  })

  it('treats an unreadable claim as no change', () => {
    expect(resolveClaimOutcome('pending', null)).toEqual({
      status: 'pending',
      paymentMethod: null,
      alreadyPaid: false,
    })
  })

  it('adopts a cancelled status from a 409', () => {
    expect(resolveClaimOutcome('pending', { status: 'cancelled' })).toEqual({
      status: 'cancelled',
      paymentMethod: null,
      alreadyPaid: false,
    })
  })

  it('does not invent payment for a status it cannot read', () => {
    expect(resolveClaimOutcome('pending', { status: 'refunded' })).toEqual({
      status: 'refunded',
      paymentMethod: null,
      alreadyPaid: false,
    })
  })
})

describe('isChangedDuplicate', () => {
  it('flags a retried create whose cart no longer matches the order', () => {
    // The order that landed holds the earlier items; the edits were never
    // sent, so the client must not pretend they were.
    expect(
      isChangedDuplicate({ duplicate: true, total_cents: 1000 }, 600)
    ).toBe(true)
  })

  it('accepts a retry of the same cart as the same order', () => {
    expect(
      isChangedDuplicate({ duplicate: true, total_cents: 1000 }, 1000)
    ).toBe(false)
  })

  it('never treats a fresh create as a duplicate', () => {
    expect(
      isChangedDuplicate({ duplicate: false, total_cents: 1000 }, 600)
    ).toBe(false)
    expect(isChangedDuplicate({ total_cents: 1000 }, 600)).toBe(false)
  })
})

describe('isPayableOrder', () => {
  it('allows only a pending order with no recorded payment', () => {
    expect(isPayableOrder({ status: 'pending' })).toBe(true)
    expect(isPayableOrder({ status: 'pending', paymentRecorded: false })).toBe(true)
  })

  it('refuses an order that is already paid, cancelled or has a payment row', () => {
    expect(isPayableOrder({ status: 'paid' })).toBe(false)
    expect(isPayableOrder({ status: 'cancelled' })).toBe(false)
    expect(isPayableOrder({ status: 'pending', paymentRecorded: true })).toBe(false)
  })
})

describe('resolveLiveStatus', () => {
  it('promotes a pending order with a succeeded payment row to paid', () => {
    // The ledger is the authority: showing "unpaid" would invite a second
    // payment for money that already moved.
    expect(resolveLiveStatus('pending', true)).toBe('paid')
  })

  it('leaves a pending order with no payment row pending', () => {
    expect(resolveLiveStatus('pending', false)).toBe('pending')
  })

  it('never lets a payment row outrank a cancellation', () => {
    expect(resolveLiveStatus('cancelled', true)).toBe('cancelled')
  })

  it('keeps a paid order paid', () => {
    expect(resolveLiveStatus('paid', true)).toBe('paid')
    expect(resolveLiveStatus('ready', false)).toBe('ready')
  })
})

describe('isStaleLiveRead', () => {
  it('rejects a pending read that lands after the order was paid', () => {
    // A poll response that left before the claim committed must not put a
    // live QR back on a paid order.
    expect(isStaleLiveRead('paid', 'pending')).toBe(true)
    expect(isStaleLiveRead('preparing', 'pending')).toBe(true)
  })

  it('accepts forward transitions', () => {
    expect(isStaleLiveRead('pending', 'paid')).toBe(false)
    expect(isStaleLiveRead('paid', 'ready')).toBe(false)
    expect(isStaleLiveRead('pending', 'pending')).toBe(false)
  })

  it('lets a cancellation through', () => {
    expect(isStaleLiveRead('paid', 'cancelled')).toBe(false)
  })
})

describe('tablePaymentTone', () => {
  it('reads a QR-claimed payment as received', () => {
    expect(tablePaymentTone({ status: 'paid', paymentMethod: 'qr_pay' })).toBe(
      'paid_by_qr'
    )
  })

  it('reads a cash-settled order as already paid elsewhere', () => {
    // "Payment received" here would tell the diner their QR transfer landed
    // when a cashier had already taken cash.
    expect(tablePaymentTone({ status: 'paid', paymentMethod: 'cash' })).toBe(
      'paid_elsewhere'
    )
  })

  it('keeps an unknown method on a paid order as received', () => {
    // A manually marked paid order has no method; the money did move.
    expect(tablePaymentTone({ status: 'paid', paymentMethod: null })).toBe(
      'paid_by_qr'
    )
  })

  it('never invents payment for an unpaid or unknown status', () => {
    expect(tablePaymentTone({ status: 'pending' })).toBe('unpaid')
    expect(tablePaymentTone({ status: 'refunded' })).toBe('unpaid')
    expect(tablePaymentTone({ status: 'cancelled' })).toBe('cancelled')
  })
})

describe('buildTablePaymentStatusPayload', () => {
  it('builds the status payload with snake_case keys', () => {
    expect(
      buildTablePaymentStatusPayload({
        tableToken: 't'.repeat(32),
        idempotencyKey: 'k'.repeat(20),
      })
    ).toEqual({ table_token: 't'.repeat(32), idempotency_key: 'k'.repeat(20) })
  })
})

describe('parseTableOrderSuccess', () => {
  const BODY = {
    order_id: '11111111-1111-4111-8111-111111111111',
    order_number: 'MKTEST',
    display_code: 'MK-001',
    total_cents: 2500,
    table_label: 'T3',
    pax: 2,
    status: 'pending',
  }

  it('parses a created order and carries the duplicate marker', () => {
    expect(parseTableOrderSuccess({ ...BODY, duplicate: true })).toMatchObject({
      order_id: BODY.order_id,
      status: 'pending',
      duplicate: true,
      already_paid: false,
      payment_method: null,
    })
  })

  it('returns null for an unreadable 2xx body', () => {
    // The client must not clear the cart or route to success on a body it
    // cannot read: the order may never have been created.
    expect(parseTableOrderSuccess(null)).toBeNull()
    expect(parseTableOrderSuccess(undefined)).toBeNull()
    expect(parseTableOrderSuccess('ok')).toBeNull()
    expect(parseTableOrderSuccess({})).toBeNull()
    expect(parseTableOrderSuccess({ ...BODY, total_cents: '2500' })).toBeNull()
  })
})

describe('parseTablePaymentClaim', () => {
  it('parses a claim and keeps the recorded method', () => {
    expect(
      parseTablePaymentClaim({
        ok: true,
        order_id: '11111111-1111-4111-8111-111111111111',
        status: 'paid',
        amount_cents: 2500,
        payment_method: 'cash',
        paid_at: '2026-10-28T10:00:00.000Z',
        already_paid: true,
      })
    ).toMatchObject({
      status: 'paid',
      payment_method: 'cash',
      already_paid: true,
    })
  })

  it('returns null for an unreadable 2xx body instead of throwing', () => {
    // The success branch used to dereference a null body inside a state
    // updater, taking down the whole page.
    expect(parseTablePaymentClaim(null)).toBeNull()
    expect(parseTablePaymentClaim({})).toBeNull()
    expect(parseTablePaymentClaim({ status: 'paid' })).toBeNull()
    expect(
      parseTablePaymentClaim({ status: 'paid', amount_cents: 1, payment_method: 5 })
    ).toBeNull()
  })
})

describe('parseTableOrderStatus', () => {
  it('parses a live status, including the ledger flag', () => {
    expect(
      parseTableOrderStatus({
        order_id: '11111111-1111-4111-8111-111111111111',
        status: 'paid',
        total_cents: 2500,
        payment_method: 'qr_pay',
        paid_at: '2026-10-28T10:00:00.000Z',
        payment_recorded: true,
      })
    ).toEqual({
      order_id: '11111111-1111-4111-8111-111111111111',
      status: 'paid',
      total_cents: 2500,
      payment_method: 'qr_pay',
      paid_at: '2026-10-28T10:00:00.000Z',
      payment_recorded: true,
    })
  })

  it('returns null for an unreadable body, never a pending default', () => {
    expect(parseTableOrderStatus(null)).toBeNull()
    expect(parseTableOrderStatus({ status: 'paid' })).toBeNull()
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

  it('keeps the recorded payment method for a resumed screen', () => {
    // The resume path must be able to say "already paid by Cash" before the
    // status refresh lands, not assume the diner's QR transfer was received.
    const raw = serializeStoredTableOrder({
      success: {
        ...SUCCESS,
        status: 'paid',
        payment_method: 'cash',
        already_paid: true,
      },
      idempotencyKey: 'k'.repeat(32),
    })
    expect(parseStoredTableOrder(raw)?.success).toMatchObject({
      status: 'paid',
      payment_method: 'cash',
      already_paid: true,
    })
  })

  it('rejects a stored snapshot with a malformed payment method', () => {
    expect(
      parseStoredTableOrder(
        JSON.stringify({
          success: { ...SUCCESS, payment_method: 42 },
          idempotencyKey: 'k'.repeat(32),
        })
      )
    ).toBeNull()
  })
})
