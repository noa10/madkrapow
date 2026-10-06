/**
 * Derives payment and delivery provider info from raw order fields.
 *
 * Payment:
 * - Stripe when stripe_payment_intent_id or stripe_session_id is set
 * - Platform channels (grabfood/foodpanda) — the customer paid in the platform app
 * - QR Pay / Cash when a payment method is known (counter POS)
 * - Awaiting Payment when the order is still pending
 * - Cash as the manual fallback for confirmed orders
 *
 * Delivery:
 * - Self Pickup when delivery_type === "self_pickup"
 * - Platform rider for grabfood/foodpanda delivery orders
 * - Lalamove when lalamove_order_id or lalamove_quote_id is set
 * - In-house when an explicit driver is named on the order row
 * - Pending Dispatch otherwise
 */
export type PaymentProvider =
  | "stripe"
  | "cash"
  | "qr_pay"
  | "grabfood"
  | "foodpanda"
  | "pending"
export type DeliveryProvider =
  | "lalamove"
  | "self_pickup"
  | "in_house"
  | "platform"
  | "pending"

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
  source?: string | null
  payment_method?: string | null
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
  if (order.source === "grabfood") {
    return { provider: "grabfood", label: "GrabFood" }
  }
  if (order.source === "foodpanda") {
    return { provider: "foodpanda", label: "Foodpanda" }
  }
  if (order.payment_method === "qr_pay") {
    return { provider: "qr_pay", label: "QR Pay" }
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
  if (order.source === "grabfood") {
    return { provider: "platform", label: "GrabFood Rider" }
  }
  if (order.source === "foodpanda") {
    return { provider: "platform", label: "Foodpanda Rider" }
  }
  if (order.lalamove_order_id || order.lalamove_quote_id) {
    return { provider: "lalamove", label: "Lalamove" }
  }
  if (order.driver_name || order.driver_phone) {
    return { provider: "in_house", label: "In-house" }
  }
  return { provider: "pending", label: "Pending Dispatch" }
}
