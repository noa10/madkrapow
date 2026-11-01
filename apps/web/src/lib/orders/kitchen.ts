/**
 * Which orders belong on the kitchen board.
 *
 * Table-QR dine-in orders can be created `pending` (the diner chose to pay at
 * the counter) and are cooked immediately. POS Pay-later is no longer created
 * — a counter sale is always paid — but pending counter tickets from before
 * that change stay active until they are settled. Pending web delivery/pickup
 * orders are abandoned checkouts and must stay off the board.
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
