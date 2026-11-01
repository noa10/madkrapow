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
 * True when this status means the bill is settled.
 *
 * Used by the payment step on a 409: an order already marked paid (by a
 * cashier, or by an earlier claim) must show its receipt, not ask for money
 * again.
 */
export function isPaidOrderStatus(status: unknown): boolean {
  return typeof status === 'string' && PAID_SET.has(status)
}

/**
 * What the receipt badge says.
 *
 * An unknown status maps to `unpaid`: showing PAID on a status this module has
 * never heard of would let a diner present a receipt the cashier cannot
 * reconcile, and would invite a second payment to be skipped.
 */
export function receiptStatus(status: string): ReceiptStatus {
  return resolveReceiptStatus(status, null)
}

/**
 * The receipt badge for a stored order plus its payment rows.
 *
 * A succeeded payment is proof the money moved even if `orders.status` has not
 * caught up, so the badge follows the ledger. Cancellation outranks both: a
 * refunded sale must never surface as a PAID receipt.
 */
export function resolveReceiptStatus(
  orderStatus: string,
  payments: readonly { status: string }[] | null
): ReceiptStatus {
  if (orderStatus === 'cancelled') return 'cancelled'
  if (PAID_SET.has(orderStatus)) return 'paid'
  if ((payments ?? []).some((payment) => payment.status === 'succeeded')) {
    return 'paid'
  }
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
