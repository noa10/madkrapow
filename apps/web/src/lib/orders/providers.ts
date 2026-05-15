/**
 * Derives payment and delivery provider info from raw order fields.
 *
 * Payment:
 * - Stripe when stripe_payment_intent_id or stripe_session_id is set
 * - Cash on Delivery as the manual fallback for confirmed orders
 * - Awaiting Payment when the order is still pending
 *
 * Delivery:
 * - Self Pickup when delivery_type === "self_pickup"
 * - Lalamove when lalamove_order_id or lalamove_quote_id is set
 * - In-house when an explicit driver is named on the order row
 * - Pending Dispatch otherwise
 */
export type PaymentProvider = "stripe" | "cash" | "pending"
export type DeliveryProvider = "lalamove" | "self_pickup" | "in_house" | "pending"

export interface PaymentBadge {
  provider: PaymentProvider
  label: string
}

export interface DeliveryBadge {
  provider: DeliveryProvider
  label: string
}

export interface ProviderSourceFields {
  status?: string | null
  delivery_type?: string | null
  stripe_payment_intent_id?: string | null
  stripe_session_id?: string | null
  lalamove_order_id?: string | null
  lalamove_quote_id?: string | null
  driver_name?: string | null
  driver_phone?: string | null
  order_kind?: string | null
}

export function getPaymentBadge(order: ProviderSourceFields): PaymentBadge {
  if (order.stripe_payment_intent_id || order.stripe_session_id) {
    return { provider: "stripe", label: "Stripe" }
  }
  if (order.status === "pending") {
    return { provider: "pending", label: "Awaiting Payment" }
  }
  return { provider: "cash", label: "Cash" }
}

export function getDeliveryBadge(order: ProviderSourceFields): DeliveryBadge {
  if (order.delivery_type === "self_pickup") {
    return { provider: "self_pickup", label: "Self Pickup" }
  }
  if (order.lalamove_order_id || order.lalamove_quote_id) {
    return { provider: "lalamove", label: "Lalamove" }
  }
  if (order.driver_name || order.driver_phone) {
    return { provider: "in_house", label: "In-house" }
  }
  return { provider: "pending", label: "Pending Dispatch" }
}
