import { describe, expect, it } from 'vitest'
import {
  isClaimedByDiner,
  isPaidOrderStatus,
  receiptPaymentLabel,
  receiptStatus,
  resolveReceiptStatus,
  PAID_ORDER_STATUSES,
} from '../receipt'

describe('receiptStatus', () => {
  it('maps pending dine-in orders to unpaid', () => {
    expect(receiptStatus('pending')).toBe('unpaid')
  })

  it('maps every progressed paid status to paid', () => {
    for (const status of [
      'paid',
      'accepted',
      'preparing',
      'ready',
      'picked_up',
      'delivered',
    ]) {
      expect(receiptStatus(status)).toBe('paid')
    }
  })

  it('maps cancelled to cancelled and unknown statuses to unpaid', () => {
    expect(receiptStatus('cancelled')).toBe('cancelled')
    // Unknown is not proof of payment: the diner must not be shown a PAID
    // receipt the cashier cannot verify.
    expect(receiptStatus('something-new')).toBe('unpaid')
  })

  it('exposes exactly the statuses it treats as paid', () => {
    expect([...PAID_ORDER_STATUSES].sort()).toEqual([
      'accepted',
      'delivered',
      'paid',
      'picked_up',
      'preparing',
      'ready',
    ])
  })
})

describe('resolveReceiptStatus', () => {
  it('treats a succeeded payment row as paid even while the order is pending', () => {
    // The claim writes the payment row and bumps the status in one function, but
    // a receipt rendered mid-transaction — or after a payment recorded another
    // way — must still reconcile: the money moved.
    expect(resolveReceiptStatus('pending', [{ status: 'succeeded' }])).toBe('paid')
  })

  it('lets a cancellation win over a stale payment row', () => {
    expect(resolveReceiptStatus('cancelled', [{ status: 'succeeded' }])).toBe(
      'cancelled'
    )
  })

  it('ignores failed and absent payment rows', () => {
    expect(resolveReceiptStatus('pending', [{ status: 'failed' }])).toBe('unpaid')
    expect(resolveReceiptStatus('pending', [])).toBe('unpaid')
    expect(resolveReceiptStatus('pending', null)).toBe('unpaid')
  })

  it('maps progressed statuses exactly as receiptStatus does', () => {
    for (const status of PAID_ORDER_STATUSES) {
      expect(resolveReceiptStatus(status, null)).toBe('paid')
    }
    expect(resolveReceiptStatus('weird', null)).toBe('unpaid')
  })
})

describe('isPaidOrderStatus', () => {
  it('accepts every paid status and the unknown/blank ones it does not know', () => {
    for (const status of PAID_ORDER_STATUSES) {
      expect(isPaidOrderStatus(status)).toBe(true)
    }
    expect(isPaidOrderStatus('pending')).toBe(false)
    expect(isPaidOrderStatus('cancelled')).toBe(false)
    expect(isPaidOrderStatus('')).toBe(false)
    expect(isPaidOrderStatus(null)).toBe(false)
    expect(isPaidOrderStatus(undefined)).toBe(false)
    expect(isPaidOrderStatus(42)).toBe(false)
  })
})

describe('receiptPaymentLabel', () => {
  it('labels qr_pay as QR Pay, cash as Cash and null as a dash', () => {
    expect(receiptPaymentLabel('qr_pay')).toBe('QR Pay')
    expect(receiptPaymentLabel('cash')).toBe('Cash')
    expect(receiptPaymentLabel(null)).toBe('—')
  })

  it('labels the online gateways as Card and passes other methods through', () => {
    expect(receiptPaymentLabel('stripe')).toBe('Card')
    expect(receiptPaymentLabel('billplz')).toBe('Card')
    expect(receiptPaymentLabel('ewallet')).toBe('ewallet')
  })
})

describe('isClaimedByDiner', () => {
  it('detects a diner-claimed payment', () => {
    expect(isClaimedByDiner({ claimed_via: 'table_qr' })).toBe(true)
  })

  it('rejects other, missing and non-object payloads', () => {
    expect(isClaimedByDiner({})).toBe(false)
    expect(isClaimedByDiner(null)).toBe(false)
    expect(isClaimedByDiner(undefined)).toBe(false)
    expect(isClaimedByDiner('table_qr')).toBe(false)
    expect(isClaimedByDiner({ claimed_via: 'stripe_webhook' })).toBe(false)
  })
})
