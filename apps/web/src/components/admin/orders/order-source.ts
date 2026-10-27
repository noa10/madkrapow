/**
 * Source / fulfillment presentation tables for the admin order cards.
 *
 * Pure data + helpers (no React) so both `OrderCard` and any future consumer
 * share a single copy of the labels and pill colours. This replaces the
 * `SOURCE_LABELS` / `SOURCE_COLORS` tables that previously lived inline in the
 * deleted `OrderRowCard`; the colour pairs are kept verbatim.
 */

import type { Order, OrderSource } from "@/types/orders"

/** Human-readable label for every known order source. */
export const SOURCE_LABELS: Record<OrderSource, string> = {
  web: "Web",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  mobile: "Mobile",
  counter: "Counter",
  grabfood: "GrabFood",
  foodpanda: "Foodpanda",
}

/** Dark-theme text-pill classes for every known order source. */
export const SOURCE_PILL_CLASSES: Record<OrderSource, string> = {
  web: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  telegram: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  whatsapp: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  mobile: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  counter: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  grabfood: "bg-green-500/15 text-green-400 border-green-500/30",
  foodpanda: "bg-pink-500/15 text-pink-400 border-pink-500/30",
}

/** Label for a source, falling back to the raw wire string when unknown. */
export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source as OrderSource] ?? source
}

/** Fulfillment label: `Dine In`, `Pickup` for self-pickup, otherwise `Delivery`. */
export function getFulfillmentLabel(order: Pick<Order, "delivery_type">): string {
  if (order.delivery_type === "dine_in") return "Dine In"
  return order.delivery_type === "self_pickup" ? "Pickup" : "Delivery"
}

/**
 * Extra fulfillment context shown next to the label — table + party size for
 * dine-in orders. `null` for every other fulfillment type.
 */
export function getFulfillmentDetail(
  order: Pick<Order, "delivery_type" | "table_label" | "pax">
): string | null {
  if (order.delivery_type !== "dine_in") return null
  const table = order.table_label ? `Table ${order.table_label}` : "Dine in"
  return order.pax != null ? `${table} · ${order.pax} pax` : table
}
