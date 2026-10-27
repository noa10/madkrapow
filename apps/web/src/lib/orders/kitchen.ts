/**
 * Which orders belong on the kitchen board.
 *
 * Table-QR dine-in orders are created `pending` (the diner pays at the
 * counter) and POS pay-later orders are created `pending` (cash collected
 * later). The kitchen must start cooking both immediately, so pending
 * dine-in and pending POS counter tickets are active. Pending web
 * delivery/pickup orders are abandoned checkouts and must stay off the board.
 *
 * Shared by the kitchen page, its data hook and the tests so the fetch filter
 * and the client filter cannot drift.
 */

export const KITCHEN_ACTIVE_STATUSES = [
  'paid',
  'accepted',
  'preparing',
  'ready',
] as const

export function isKitchenActive(order: {
  status: string
  delivery_type?: string | null
  source?: string | null
}): boolean {
  if ((KITCHEN_ACTIVE_STATUSES as readonly string[]).includes(order.status)) {
    return true
  }
  if (order.status !== 'pending') return false
  return order.delivery_type === 'dine_in' || order.source === 'counter'
}

/**
 * PostgREST `or=` expression matching {@link isKitchenActive}, so the initial
 * fetch cannot be crowded out by completed orders or abandoned checkouts.
 */
export const KITCHEN_QUEUE_OR_FILTER =
  'status.in.(paid,accepted,preparing,ready),and(status.eq.pending,delivery_type.eq.dine_in),and(status.eq.pending,source.eq.counter)'
