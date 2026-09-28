# GrabFood Partner API Integration (POS)

This document describes the GrabFood integration that makes MadKrapow the
single source of truth for GrabFood orders. GrabFood is a **sales channel**;
the canonical order lives in the `orders` table with `source = 'grabfood'`.

## Architecture

```
GrabFood (app)                    MadKrapow (Next.js + Supabase)
────────────────                  ──────────────────────────────
Submit Order webhook  ──POST──►  /api/integrations/grabfood/webhooks/submit-order
                                  verify signature → integration_events (idempotency)
                                  map items via channel_products → import_channel_order RPC
                                  → orders (source='grabfood', status='paid')
                                  → order_items snapshots → payments (method='grabfood')
                                  → channel_orders (external identity)

Push Order State webhook ─POST─► /api/integrations/grabfood/webhooks/order-state
                                  maps Grab states onto the internal status machine
                                  via atomic conditional updates

Outbound (staff actions):
  kitchen [Ready]   ──► /api/integrations/grabfood/orders/[id]/ready
                        local preparing→ready, then POST /partner/v1/orders/mark
  admin [Cancel]    ──► /api/integrations/grabfood/orders/[id]/cancel
                        PUT /partner/v1/order/cancel first, then local mirror

Menu sync (admin action):
  POST /api/integrations/grabfood/menu/sync
                        channel_products + menu_items → PUT /partner/v1/batch/menu
                        (+ POST /partner/v1/merchant/menu/notification)
```

## Order model mapping

| GrabFood                     | MadKrapow                                            |
| ---------------------------- | ---------------------------------------------------- |
| `orderID`                    | `channel_orders.external_order_id` (idempotency key) |
| `shortOrderNumber` (GF-xxx)  | `channel_orders.external_order_number`               |
| `merchantID`                 | `channel_orders.external_store_id`                   |
| `items[].merchantItemID`     | `channel_products.external_item_id` → `menu_item_id` |
| `price.subtotal`             | `orders.subtotal_cents` (sen)                        |
| merchant-funded promos       | `orders.discount_cents`                              |
| `price.total`                | **not used as order total** — includes delivery fee; our total = subtotal − merchant discount |
| `cutlery`                    | `orders.include_cutlery`                             |

Money is integer sen everywhere (Grab MYR exponent = 2 — compatible with the
house convention).

### Status mapping

Grab states map onto the existing 8-status machine (no new statuses; parity
test untouched):

| Grab state       | Internal status / transition                      |
| ---------------- | ------------------------------------------------- |
| (Submit Order)   | order created as `paid` (Grab already took payment) |
| `Accepted`       | `preparing`                                        |
| `DriverAssigned` | (no change — kitchen keeps preparing)              |
| `DriverArrived`  | `ready`                                            |
| `Completed`      | `picked_up` → `delivered` (chain applied atomically) |
| `Cancelled` / `Failed` | `cancelled` (only from cancellable statuses) |

Internal and external status are kept separate (`orders.status` vs
`channel_orders.external_status`); the UI always renders the internal status.

## Idempotency

Three layers, mirroring the Stripe/Lalamove webhook discipline:

1. `integration_events` — UNIQUE(provider, event_type, external_event_id);
   replays are acked 200 with `status='skipped'`.
2. `channel_orders` — UNIQUE(channel, external_order_id) is the hard guarantee;
   the `import_channel_order` RPC rolls back and reports `duplicate` on races.
3. Order-state transitions use atomic conditional updates
   (`.eq('status', current)`), the same guard as the Stripe webhook.

## Product mapping

Products are mapped per channel in `channel_products` (admin-managed):

- `menu_item_id` → the master product (counter/web price lives on `menu_items`)
- `external_item_id` → Grab's `merchantItemID` (from the menu setup on Grab's
  side or Get Menu response)
- `price_cents` → optional channel price (GrabFood RM13 vs counter RM10)
- `is_available` → ANDed with the master availability when pushing updates

Unmapped items cause the submit-order webhook to return 5xx so Grab retries
after the mapping is fixed (the raw payload stays in `integration_events`).

## Configuration

| Variable                          | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `GRABFOOD_ENABLED`                | Feature flag (default false)              |
| `GRABFOOD_ENV`                    | `mock` \| `staging` \| `production`       |
| `GRABFOOD_CLIENT_ID` / `_SECRET`  | OAuth client (Grab Developer Portal)      |
| `GRABFOOD_MERCHANT_ID`            | Outlet's Grab merchant ID                 |
| `GRABFOOD_PARTNER_MERCHANT_ID`    | Partner-merchant ID (if assigned)         |
| `GRABFOOD_WEBHOOK_SECRET`         | Shared secret for webhook verification    |
| `GRABFOOD_WEBHOOK_SIGNATURE_HEADER` | Header carrying the signature (confirm during onboarding; default `x-grab-signature`) |

Secrets are server-side only (`lib/validators/env.ts` validates them; nothing
Grab-related is exposed to the browser bundle).

`GRABFOOD_ENV=mock` makes the outbound client return synthetic responses
without network — the full webhook ingestion flow can be exercised locally by
POSTing a payload to the webhook route with the webhook secret unset.

## Webhook signature verification

Implemented in `lib/grabfood/verify.ts`: HMAC-SHA256 over the raw request body
with `GRABFOOD_WEBHOOK_SECRET`, compared via `timingSafeEqual`. The exact
header/algorithm is part of Grab's partner-gated onboarding; align
`GRABFOOD_WEBHOOK_SIGNATURE_HEADER` (and, if needed, the scheme in
`verify.ts`) when it is confirmed in staging. Production MUST set the secret —
verification is skipped only in mock/unconfigured local setups.

## Onboarding checklist (Grab Developer Portal)

1. Register the integration, obtain staging client credentials.
2. Configure webhook callbacks: submit-order + push-order-state pointing at
   `https://<host>/api/integrations/grabfood/webhooks/...`; confirm the
   signature header/algorithm and set `GRABFOOD_WEBHOOK_*` env vars.
3. Map the menu: create `channel_products` rows (external_item_id per Grab item).
4. Staging: use Grab's menu/order simulators — test submit-order, states,
   mark-ready, cancel, menu sync, duplicate replays.
5. Production pilot: one low-traffic outlet, monitor `integration_events` and
   reconciliation, then expand.

## Reconciliation

`GET /partner/v1/orders` (window ≤ 30 days, cacheable 30 min) backs the daily
reconciliation cron (`/api/cron/grabfood/reconcile`): compare per-order totals
against `orders`/`payments` and report mismatches (Grab's side funds
promos/delivery — the merchant earning is the expected delta).
