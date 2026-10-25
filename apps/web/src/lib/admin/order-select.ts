/**
 * Explicit projection for the admin order list surfaces.
 *
 * Both `useOrderTabQuery` and `GET /api/admin/orders` previously selected
 * every order column (notes, addresses, Stripe / Lalamove identifiers, bulk
 * fields, ...) for up to 200 rows per tab. The tab UI only reads the fields
 * below, so they are the only ones on the wire.
 *
 * Keep this list in sync with `OrderCard`, `OrderOverflowMenu`, the search
 * predicate (`lib/orders/search`) and `getPaymentPill`:
 *  - id / display_code        → display code + links
 *  - status                    → pills, transitions, summaries
 *  - total_cents               → card total + history summary
 *  - created_at                → ordering + urgency
 *  - delivery_type             → fulfillment label (Pickup/Delivery)
 *  - fulfillment_type          → Scheduled badge + realtime tab assignment
 *  - dispatch_status           → Dispatch Failed badge
 *  - customer_name             → card customer line + search
 *  - customer_phone            → search
 *  - order_kind                → Bulk badge + realtime tab assignment
 *  - source                    → source pill + payment pill
 *  - stripe_payment_intent_id  → payment pill
 *  - stripe_session_id         → payment pill
 *  - billplz_bill_id           → payment pill
 *
 * `order_items(quantity)` stays embedded because the list derives
 * `item_count` from it; `order_items` itself is removed during that mapping.
 */

import type { Order } from "@/types/orders";

export const ADMIN_ORDER_LIST_COLUMNS = [
  "id",
  "display_code",
  "status",
  "total_cents",
  "created_at",
  "delivery_type",
  "fulfillment_type",
  "dispatch_status",
  "customer_name",
  "customer_phone",
  "order_kind",
  "source",
  "stripe_payment_intent_id",
  "stripe_session_id",
  "billplz_bill_id",
] as const;

/** Select string shared by the tab hook and the admin orders API route. */
export const ADMIN_ORDER_LIST_SELECT = `${ADMIN_ORDER_LIST_COLUMNS.join(
  ", "
)}, order_items(quantity)`;

/** Shape returned by {@link ADMIN_ORDER_LIST_SELECT} before `item_count` is derived. */
export type AdminOrderListRow = Pick<
  Order,
  (typeof ADMIN_ORDER_LIST_COLUMNS)[number]
> & {
  order_items: { quantity: number }[] | null;
};

/** Map an embedded-items row to the `Order` shape the tab cache stores. */
export function withOrderItemCount(row: AdminOrderListRow): Order {
  const { order_items, ...rest } = row;
  const itemCount = (order_items ?? []).reduce(
    (total, item) => total + item.quantity,
    0
  );
  // `Order` still declares columns this projection intentionally omits; list
  // consumers only read the selected fields, so the cast mirrors the previous
  // `data as Order[]` boundary without introducing `any`.
  return { ...rest, item_count: itemCount } as Order;
}
