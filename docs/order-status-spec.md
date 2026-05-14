# Order Status Spec

This document is the **human-facing canonical reference** for the order status workflow across the React web app (`apps/web`), the Flutter customer app (`apps/mobile`), and the Flutter merchant app (`apps/merchant`).

The **machine source of truth** is [`packages/madkrapow_orders/order_status.json`](../packages/madkrapow_orders/order_status.json). All platform constants are generated from or validated against that file. The generated outputs are:

- `apps/web/src/lib/orders/status.ts` (TypeScript module for the web app)
- `packages/madkrapow_orders/lib/order_status.g.dart` (generated Dart constants for both Flutter apps)

A CI parity guard (`scripts/check-order-status-parity.ts`, run via `npm run lint:parity`) ensures the JSON spec, the TypeScript module, the Dart package, and the SQL CHECK constraint extracted from `supabase/migrations/*.sql` all agree. If they disagree, CI fails.

## 1. Statuses

The `orders.status` column accepts exactly these eight values (per `supabase/migrations/008_scheduled_bulk_orders.sql:9-12`):

| Status | Role | Customer label | Admin label | Color role | Terminal? |
|---|---|---|---|---|---|
| `pending` | Awaiting Stripe payment confirmation | "Pending Payment" | "Pending" | warning | No |
| `paid` | Webhook received, ready for kitchen | "Paid" | "Paid" | info | No |
| `accepted` | Reserved for the bulk approval flow only | (hidden in stepper) | "Accepted" (only on bulk) | info | No |
| `preparing` | Kitchen has started | "Preparing" | "Preparing" | primary | No |
| `ready` | Ready for pickup or hand-off | "Ready" | "Ready" | success | No |
| `picked_up` | Driver / customer picked up | "On the way" / "Picked Up" | "Picked Up" | success | No |
| `delivered` | Final happy path | "Delivered" | "Delivered" | success | **Yes** |
| `cancelled` | Final unhappy path | "Cancelled" | "Cancelled" | danger | **Yes** |

Notes:
- The customer-facing label for `picked_up` is `"On the way"` when `delivery_type='delivery'` and `"Picked Up"` when `delivery_type='self_pickup'`. This is the only platform-specific label override and is encoded as a function `customerLabel(status, deliveryType)`.
- `accepted` is **hidden** from the standard stepper. It only appears in the order-events timeline when the bulk approval flow uses it explicitly.

## 2. Forward transition matrix (server-enforced)

The web admin status route (`apps/web/src/app/api/admin/orders/[id]/status/route.ts`) is the single enforcement point for client-driven transitions. The Lalamove webhook handler (`apps/web/src/app/api/webhooks/lalamove/route.ts`) is the only other path that mutates `orders.status`.

```
pending   → paid (Stripe webhook) | cancelled (admin)
paid      → preparing (admin) | cancelled (admin)
accepted  → cancelled (admin)                       # bulk-only dead-end forward
preparing → ready (admin/kitchen) | cancelled (admin)
ready     → picked_up (Lalamove webhook / pickup confirmation) | cancelled (admin)
picked_up → delivered (Lalamove webhook)
delivered → (terminal)
cancelled → (terminal)
```

The `picked_up` and `delivered` transitions are **not** reachable through the admin status route — they come from Lalamove webhooks (or self-pickup confirmation paths). Clients hide buttons that would attempt those transitions.

## 3. Cancellable set

Statuses where the server allows `→ cancelled`:

```
{ pending, paid, accepted, preparing, ready }
```

Clients **hide** the cancel button outside this set; the server is still the gate.

## 4. Flow steps (stepper)

Both customer and admin steppers render six steps in this order:

```
pending → paid → preparing → ready → picked_up → delivered
```

The `accepted` status is intentionally absent from the standard stepper. Bulk orders show a separate `approval_status` banner instead (see §6).

`cancelled` is rendered as a distinct red banner, not as a step in the stepper.

## 5. Color roles → platform tokens

| Role | Tailwind | Material |
|---|---|---|
| primary | `bg-orange-100 text-orange-800` | `colorScheme.primary` |
| success | `bg-green-100 text-green-800` | `Colors.green` |
| info | `bg-blue-100 text-blue-800` | `Colors.blue` |
| warning | `bg-yellow-100 text-yellow-800` | `Colors.amber.shade700` |
| danger | `bg-red-100 text-red-800` | `colorScheme.error` |
| neutral | `bg-gray-100 text-gray-800` | `Colors.grey` |

## 6. Bulk approval lifecycle

Bulk orders (`order_kind = 'bulk'`) carry an additional `approval_status` column with values `pending_review | approved | rejected`. The bulk lifecycle interacts with `orders.status` as follows:

- `pending_review` → bulk order is awaiting admin review. Customer sees a "Your order is being reviewed" banner.
- `approved` → admin has approved the bulk order; Stripe checkout link is created. Customer sees a "Pay Now" CTA.
- `rejected` → admin has rejected. The server also sets `orders.status = 'cancelled'` and emits a `bulk_rejected` event.

## 7. Notification allowlist (Telegram / WhatsApp)

The `apps/web/src/lib/bots/order-notifications.ts` helper sends customer messages **only** for the statuses below. Other statuses are explicitly suppressed.

```
{ preparing, ready, picked_up, delivered, cancelled }
```

Suppressed: `pending, paid, accepted` (these are "system bookkeeping" states the customer doesn't need a Telegram/WhatsApp message for).

## 8. Dispatch lifecycle (Lalamove)

`lalamove_shipments.dispatch_status` is independent of `orders.status` and tracks the delivery side. Its eleven values are defined in `supabase/migrations/013_lalamove_v3_shipping.sql:13-26`. Two values surface as user-visible banners on every platform:

- `manual_review` — driver rejection limit reached. Merchant gets a retry/cancel banner; customer gets a read-only "we're working on it" banner.
- `failed` — driver expired. Same treatment as `manual_review`.

The full set of banner messages is in `dispatchMessages` in the JSON spec.

## 9. Realtime + polling story

| Surface | Realtime | Polling | App-resume refetch |
|---|---|---|---|
| Web admin list | orders + lalamove_shipments | none | useEffect re-runs |
| Web customer detail | orders + lalamove_shipments + order_items | 5s, auto-stops on terminal | useEffect re-runs |
| Web admin detail | orders + lalamove_shipments | none | useEffect re-runs |
| Customer mobile detail | orders + lalamove_shipments + order_events | 5s, auto-stops on terminal | `AppLifecycleState.resumed` |
| Customer mobile list | n/a | none | `AppLifecycleState.resumed` |
| Merchant mobile detail | orders + lalamove_shipments + order_events | 5s, auto-stops on terminal | `AppLifecycleState.resumed` |
| Merchant mobile list | orders | none | `AppLifecycleState.resumed` |

## 10. Out of scope (decisions locked 2026-05-14)

- Adding new schema statuses (`refunded`, `failed_payment`, `out_for_delivery`, etc.). Refund and payment-failure context are surfaced via Stripe joins and `order_events` only.
- FCM for the customer Flutter app. Customer mobile relies on realtime + 5-second polling.
- Migrating `orders.status` to a Postgres ENUM type (a destructive migration, deferred).

## 11. How to change a status

1. Edit `packages/madkrapow_orders/order_status.json`.
2. Run `dart run packages/madkrapow_orders/tool/generate.dart` to regenerate `order_status.g.dart`.
3. Regenerate the web TS module if its codegen step is decoupled.
4. Run `npm run lint:parity` — it must pass.
5. If the SQL CHECK constraint changed, write a new migration in `supabase/migrations/` that ALTERs the constraint.
6. Run `flutter test` in both apps and `npm test` for web.
