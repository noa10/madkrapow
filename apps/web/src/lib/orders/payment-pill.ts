/**
 * Pure derivation of the redesigned admin orders payment pill.
 *
 * Reuses `getPaymentBadge` (./providers) so the method labels (Stripe /
 * GrabFood / Foodpanda / QR Pay / Cash) stay in sync with the provider badges
 * rather than being re-derived from raw fields.
 */

import { getPaymentBadge } from "@/lib/orders/providers"
import type { PaymentProvider } from "@/lib/orders/providers"
import type { Order } from "@/types/orders"

export type PaymentPillState = "unpaid" | "paid"

export interface PaymentPill {
  state: PaymentPillState
  label: string
  method: string | null
}

export type PaymentPillOrder = Pick<
  Order,
  "status" | "source" | "stripe_payment_intent_id" | "stripe_session_id" | "billplz_bill_id"
> & { payment_method?: string | null }

/**
 * Providers whose badge is *proven* by a field on the order row itself.
 * `cash` is deliberately absent: `getPaymentBadge` returns it as the catch-all
 * when nothing else matched, so it means "we could not tell", not "cash".
 */
const EVIDENCE_BACKED_PROVIDERS = new Set<PaymentProvider>([
  "stripe",
  "billplz",
  "grabfood",
  "foodpanda",
  "qr_pay",
])

/**
 * Derives the payment pill.
 *
 * A `pending` order (or one whose provider mapping resolves to `pending`) is
 * `unpaid` with no method; every other order is `paid`.
 *
 * The method is only reported when the data actually proves it. `orders`
 * carries a `payment_method` snapshot written by the POS/settle paths; the
 * `payments` table remains the ledger, and Stripe/Billplz/platform evidence
 * still takes precedence. A paid counter order created before that snapshot
 * existed is indistinguishable from a QR-paid one, so the pill stays
 * method-less unless the row itself proves a method.
 */
export function getPaymentPill(order: PaymentPillOrder): PaymentPill {
  const badge = getPaymentBadge({
    status: order.status,
    source: order.source,
    payment_method: order.payment_method,
    stripe_payment_intent_id: order.stripe_payment_intent_id,
    stripe_session_id: order.stripe_session_id,
    billplz_bill_id: order.billplz_bill_id,
  })

  if (order.status === "pending" || badge.provider === "pending") {
    return { state: "unpaid", label: "Unpaid", method: null }
  }

  const proven =
    EVIDENCE_BACKED_PROVIDERS.has(badge.provider) || order.payment_method === "cash"

  return { state: "paid", label: "Paid", method: proven ? badge.label : null }
}
