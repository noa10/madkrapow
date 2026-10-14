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

Menu (admin action, /admin/grabfood):
  POST/DELETE /api/integrations/grabfood/menu/snooze   time-based sold-out
                        per-item PUT /partner/v1/menu (same-day snoozes push
                        UNAVAILABLETODAY; longer/hard ones UNAVAILABLE +
                        maxStock 0); availability is computed at read time
  GET  /api/integrations/grabfood/menu/trace   what Grab last recorded for the menu
  PATCH/POST/DELETE /api/integrations/grabfood/menu/mapping   mapping CRUD
                        (saved locally — no catalogue push to Grab)
  GET/POST /api/integrations/grabfood/store/pause   store pause toggle

The full-menu batch push (PUT /partner/v1/batch/menu) was descoped on
2026-10-14 — see "Known gaps" below.
```

Order acceptance (closes the auto-cancel gap):
  submit-order webhook → import_channel_order RPC succeeds →
  POST /partner/v1/order/prepare (accept) + PUT /partner/v1/order/readytime
  (20-minute promise). Grab-side failures land in order_events as
  `grabfood_accept_failed` and never fail the webhook (the order is already
  canonical locally).

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

1. `integration_events` — UNIQUE(provider, event_type, external_event_id).
   Replays of `processed`/`skipped` events are acked 200 as duplicates; a
   replay of a `failed` event (e.g. the first delivery hit an unmapped
   product) is reset to `received` and reprocessed, so Grab's retry after the
   mapping fix actually imports the order. `submit_order` keys on the Grab
   order id; `order_state` keys on `orderID:toState` so every stage of an
   order's lifecycle is processed once.
2. `channel_orders` — UNIQUE(channel, external_order_id) is the hard guarantee;
   the `import_channel_order` RPC rolls back and reports `duplicate` on races.
3. Order-state transitions use atomic conditional updates
   (`.eq('status', current)`), the same guard as the Stripe webhook.

## Product mapping

Products are mapped per channel in `channel_products` (admin-managed):

- `menu_item_id` → the master product (counter/web price lives on `menu_items`)
- `external_item_id` → Grab's `merchantItemID` (from the menu setup on Grab's
  side or Get Menu response)
- `price_cents` → optional channel price (GrabFood RM13 vs counter RM10).
  Mapping/price edits via `PATCH /menu/mapping` are **saved locally only** —
  with the catalogue push descoped nothing propagates them on their own; a
  stored price reaches Grab only as part of the next per-item write
  (snooze/restore), which carries price and availability together
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
`verify.ts`) when it is confirmed in staging — both webhook routes read that
configured header (default `x-grab-signature`).

Verification **fails closed**: if `GRABFOOD_WEBHOOK_SECRET` is missing in a
production process, or `GRABFOOD_ENV` is `staging`/`production`, the routes
reject every request. The unverified bypass exists only for an explicit
`mock` (or unconfigured) environment outside production.

## Onboarding checklist (Grab Developer Portal)

1. Register the integration, obtain staging client credentials.
2. Configure webhook callbacks: submit-order + push-order-state pointing at
   `https://<host>/api/integrations/grabfood/webhooks/...`; confirm the
   signature header/algorithm and set `GRABFOOD_WEBHOOK_*` env vars.
3. Map the menu: create `channel_products` rows (external_item_id per Grab item).
4. Staging: use Grab's menu/order simulators — test submit-order, states,
   mark-ready, cancel, snooze, duplicate replays.
5. Production pilot: one low-traffic outlet, monitor `integration_events` and
   reconciliation, then expand.

## Reconciliation

`GET /partner/v1/orders` (window ≤ 30 days, cacheable 30 min) backs the daily
reconciliation cron (`/api/cron/grabfood/reconcile`): compare per-order totals
against `orders`/`payments` and report mismatches (Grab's side funds
promos/delivery — the merchant earning is the expected delta). The cron
requires `CRON_SECRET` (Bearer) and fails closed when it is unset.

## Known gaps before go-live

These are deliberately out of scope for the groundwork PR and are the first
items to close during Grab onboarding (they need real credentials, captured
payloads, or a product decision):

- ~~**Order acceptance is not wired.**~~ CLOSED: submit-order now accepts on
  Grab (`POST /partner/v1/order/prepare`) right after a successful import and
  promises a 20-minute ready time; failures are recorded in `order_events`.
- **Promo/tax semantics need a captured payload.** `price.merchantFundPromo`,
  `price.basketPromo` and `price.tax` are read per the public reference;
  confirm the exact split (and whether `price.subtotal` is tax-inclusive)
  against a real onboarding payload before trusting `total_cents` for P&L.
- **Full-menu push was descoped (2026-10-14).** The throttled
  `PUT /partner/v1/batch/menu` runner (`lib/grabfood/push.ts`) landed via #420
  with an unresolved "is this still wanted?" question, and has now been removed
  along with `POST /menu/sync` and its dead scaffolding. Rationale: the menu is
  set up on Grab's side during onboarding, so the only menu writes this
  integration needs are per-item availability changes (`PUT /partner/v1/menu`,
  used by snooze) and the order lifecycle. Re-add a batch runner only if bulk
  price/catalogue sync becomes a requirement. The batch wire-shape findings
  from 2026-10-11 (`[{merchantID, field, menuEntities: [...]}]`, ≤ 200 entities
  per entry) are kept in the decision log should that change.
- **Counter QR Pay badge.** The admin/customer order queries do not join
  `payments`, so a counter order paid by QR Pay currently renders the generic
  Cash badge. Join `payments(method)` (or denormalise the method) to display
  QR Pay.

## Related analysis

The Hubbo POS (Aliments) app was reverse-engineered to inform the
snooze/availability, accept-order and printing work: see
[docs/hubbo-re-findings.md](./hubbo-re-findings.md). Key outcome: the Hubbo app
holds no GrabFood credentials — GrabFood is mediated by Hubbo's backend — so the
interim pre-onboarding path is the `lib/hubbo-merchant/` adapter (menu pull +
snooze push against `api.aliments.my`), not a GrabFood session proxy.

## Snooze and mapping UI

- **Snooze (time-based sold-out)** — `channel_products.snooze_till` /
  `menu_items.snooze_till` (migration 053). Effective availability is computed
  at read time: master AND channel availability, each gated by an active
  snooze — an expired snooze never needs a restore write. Same-day snoozes
  push Grab's native `UNAVAILABLETODAY` (auto-restores at Grab's next business
  day without another push); longer/hard unavailable states push `UNAVAILABLE`
  with `maxStock: 0` as Grab requires.
- **Mapping admin** — `/admin/grabfood`: unmapped-item warnings, inline
  mapping (POST), external id / price override / availability edits (PATCH —
  saved locally; the catalogue itself is maintained on Grab's side),
  unmap (DELETE), snooze presets (30/60/120 min) + restore, trace, and
  the store pause toggle.
- **Store controls** — pause/reopen via `PUT /partner/v1/merchant/pause`,
  status via `GET /partner/v1/merchants/{id}/store/status`.

## Interim pre-onboarding path: Hubbo merchant adapter

While official GrabFood access is pending, `lib/hubbo-merchant/` implements the
reverse-engineered Hubbo merchant backend (`api.aliments.my/alimentsBackend` —
see [hubbo-re-findings.md](./hubbo-re-findings.md)): device login → `apiKey`
header, full menu pull into the local catalog (source-tagged
`aliments_backend`, reusing the `hubbo_pos_external_id` columns) with GrabFood
`channel_products` seeding, and `snoozeMenu` push. Gated by
`HUBBO_MERCHANT_ENABLED` (default off), supports a captured
`HUBBO_MERCHANT_API_KEY` override, and `POST /api/admin/hubbopos-merchant/menu/pull`
accepts `{"dryRun": true}`. Caveats: unofficial (ToS-gray), device-ID
provisioning may gate logins, payload shapes are unconfirmed until a live pull.

## Printing (LAN thermal printers)

`lib/printing/` renders ESC/POS bytes from canonical orders (kitchen docket,
customer receipt, GrabFood ticket; 32/42/48-char widths; REPRINT watermark;
optional cash-drawer kick on counter cash receipts). Because Vercel cannot
reach a LAN printer, delivery runs through `scripts/print-bridge/` — a
dependency-free Node agent on the restaurant LAN that polls
`GET /api/print/jobs/claim` (auto-print; jobs claimed exactly once via
`order_events printed_<type>` markers) and serves `POST /print` on localhost
for manual reprints from `/pos` and the kitchen page. Setup:
[scripts/print-bridge/README.md](../scripts/print-bridge/README.md).
Env: `PRINT_BRIDGE_SECRET` (app↔bridge), `NEXT_PUBLIC_PRINT_BRIDGE_URL`,
`NEXT_PUBLIC_PRINT_BRIDGE_TOKEN` (pages→bridge).
