/**
 * Money helpers for order surfaces: the display format *and* the definitions of
 * what an order is worth.
 *
 * Prices are stored as integer cents across the codebase (RM 12.50 => 1250).
 * These helpers centralise the display format so every surface renders the same
 * "RM 12.50" string and a partial/typed-cast Supabase payload can never leak
 * "RM NaN" into the UI — and they own the totals, so no surface re-derives an
 * order's value by summing columns by hand.
 */

/**
 * Coerce a nullable money column into a usable integer count of cents.
 *
 * Orders carry nullable money columns and a cast-through-`any` Supabase
 * response can hand us `undefined` or `NaN`, so this guard is load-bearing for
 * the formatter and for every arithmetic helper below.
 */
function toCents(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/**
 * Format integer cents as a Malaysian Ringgit string, e.g. `1250 => "RM 12.50"`.
 *
 * Non-finite or missing values (null / undefined / NaN / Infinity) fall back to
 * `"RM 0.00"`.
 */
export function formatMoney(cents: number | null | undefined): string {
  return `RM ${(toCents(cents) / 100).toFixed(2)}`
}

/**
 * What an order is actually worth: the amount the customer paid.
 *
 * `orders.total_cents` is persisted **inclusive of the delivery fee** and net of
 * discount — every writer stores `subtotal_cents + delivery_fee_cents -
 * discount_cents` (`api/checkout/create/route.ts`, `api/bots/checkout/route.ts`,
 * `api/checkout/bulk/route.ts`), and Stripe is handed the items plus a separate
 * "Delivery Fee" line, so that sum is the charged amount. Adding
 * `delivery_fee_cents` on top therefore double-counts the fee, inflating a
 * RM 12.50 + RM 4.00 order to RM 20.50 instead of RM 16.50.
 *
 * Read totals through here rather than summing the columns by hand, so the
 * definition lives in exactly one place.
 */
export function orderTotalCents(order: {
  total_cents: number | null | undefined
}): number {
  return toCents(order.total_cents)
}

/**
 * The order's own charges: the "Subtotal" line of a receipt, i.e. everything
 * except the delivery fee.
 *
 * Derived from the stored total rather than read from `subtotal_cents`, so the
 * receipt's rows always reconcile to the amount charged —
 * `orderSubtotalCents(order) + delivery_fee_cents === orderTotalCents(order)`.
 * That identity also holds for legacy rows whose `subtotal_cents` was never
 * populated, which reading the column would not.
 *
 * The value is net of any discount: the gap between it and the sum of the item
 * line totals is `discount_cents`, which these receipts do not itemise.
 */
export function orderSubtotalCents(order: {
  total_cents: number | null | undefined
  delivery_fee_cents: number | null | undefined
}): number {
  return orderTotalCents(order) - toCents(order.delivery_fee_cents)
}
