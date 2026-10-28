/**
 * Receipt presentation rules for the diner-facing table receipt.
 *
 * Pure functions only — no React, no Supabase — so the mapping is unit-tested
 * away from the page that renders it.
 */

/**
 * Statuses that carry a settled bill. Shared with the payment step so the
 * client and the receipt can never disagree about what counts as paid.
 */
export const PAID_ORDER_STATUSES = [
  'paid',
  'accepted',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
] as const

export type ReceiptStatus = 'paid' | 'unpaid' | 'cancelled'

const PAID_SET: ReadonlySet<string> = new Set<string>(PAID_ORDER_STATUSES)

/**
 * What the receipt badge says.
 *
 * An unknown status maps to `unpaid`: showing PAID on a status this module has
 * never heard of would let a diner present a receipt the cashier cannot
 * reconcile, and would invite a second payment to be skipped.
 */
export function receiptStatus(status: string): ReceiptStatus {
  if (status === 'cancelled') return 'cancelled'
  if (PAID_SET.has(status)) return 'paid'
  return 'unpaid'
}

/** Human label for a recorded payment method. */
export function receiptPaymentLabel(method: string | null): string {
  switch (method) {
    case null:
      return '—'
    case 'qr_pay':
      return 'QR Pay'
    case 'cash':
      return 'Cash'
    case 'stripe':
    case 'billplz':
      return 'Card'
    default:
      return method
  }
}

/**
 * True when the diner's own "I've paid" tap recorded this payment.
 *
 * The server cannot see the bank transfer, so the receipt asks the cashier to
 * verify it. Anything other than an explicit marker is treated as not claimed.
 */
export function isClaimedByDiner(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { claimed_via?: unknown }).claimed_via === 'table_qr'
  )
}
