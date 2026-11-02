# GrabFood staging integration — implementation notes

Implemented 2 November 2026 on branch `feat/grabfood-staging-integration`
(worktree `/home/ubuntu/repos/madkrapow-grabfood`). This records what changed in
the POS code against the staging plan and the readiness audit. It is **not** a
record of a sandbox test: no staging database, portal credentials, Grab API or
production service was touched.

## What is implemented

### 1. Two independent OAuth directions

| Direction | Implementation |
|---|---|
| POS → Grab token | `lib/grabfood/auth.ts` posts the documented JSON body to `https://api.grab.com/grabid/v1/oauth2/token` with `food.partner_api`. Tokens are cached and concurrent callers share one in-flight request. A 401 clears the cache and retries once. |
| Grab → POS token | `POST /api/integrations/grabfood/oauth/token` validates the POS-issued client ID/secret (constant-time) and returns an HMAC-signed bearer token (`v1.<payload>.<sig>`) with `expires_in`. `lib/grabfood/partner-auth.ts` verifies signature, issuer, audience, expiry and scope. |
| Callback authentication | Every partner callback requires `Authorization: Bearer …`. HMAC over the raw body is enforced **only** when `GRABFOOD_WEBHOOK_HMAC_REQUIRED=true`; it never substitutes for OAuth. |

### Portal field mapping (Configurations → Partner configuration)

| Portal field | Value |
|---|---|
| Get menu endpoint | `https://<staging-host>/api/integrations/grabfood/merchant/menu` |
| Submit order endpoint | `https://<staging-host>/api/integrations/grabfood/webhooks/submit-order` |
| Push order state endpoint | `https://<staging-host>/api/integrations/grabfood/webhooks/order-state` |
| OAuth token endpoint | `https://<staging-host>/api/integrations/grabfood/oauth/token` |
| Menu Sync Webhook | `https://<staging-host>/api/integrations/grabfood/menu-sync-state` |
| Menu Event Webhook | `https://<staging-host>/api/integrations/grabfood/menu-event` |
| Push Grab menu endpoint | `https://<staging-host>/api/integrations/grabfood/pushGrabMenu` |
| Integration status endpoint | `https://<staging-host>/api/integrations/grabfood/pushIntegrationStatus` |
| OAuth scopes | `food.partner_api` |
| Partner client ID | POS-issued client ID (`GRABFOOD_PARTNER_CLIENT_ID`) |
| Partner client secret | POS-issued secret (`GRABFOOD_PARTNER_CLIENT_SECRET`) |
| Menu Structure | Selling-time based / new structure — not “Old Structure (Section Based Menu)” |
| Max Submit Order Retry Count | 3 retries (4 total attempts) unless the tooltip defines it as total attempts |

The **GrabFood Endpoints** card on the same page is read-only reference data. Its
`api.grab.com` and `partner-api.grab.com` URLs are Grab's endpoints; they do not
belong in the Partner configuration fields.

The **Partner client ID/secret** are not the Grab-issued pair used for outbound
calls. Generate a separate POS pair:

```bash
openssl rand -hex 16
openssl rand -base64 32 | tr -d '/+=' | cut -c1-32
```

Put the same pair in the portal and in the staging environment as
`GRABFOOD_PARTNER_CLIENT_ID` / `GRABFOOD_PARTNER_CLIENT_SECRET`.

### 2. Required partner endpoints

All paths are under `/api/integrations/grabfood`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/oauth/token` | Issue a POS bearer token to Grab. |
| `POST` | `/pushGrabMenu` | Receive a Grab menu export during activation; stored in `grabfood_menu_snapshots`. |
| `POST` | `/pushIntegrationStatus` | Persist `INACTIVE` / `SYNCING` / `ACTIVE` / `FAILED` and the Grab/POS store mapping. |
| `GET` | `/merchant/menu` | Return the full mapped POS menu. |
| `POST` | `/menu-sync-state` | Persist menu sync outcome/errors/job ID. |
| `POST` | `/menu-event` | Log the portal's Menu Event Webhook payload (shape not publicly documented). |
| `POST` | `/webhooks/submit-order` | Submit Order (create or edit). |
| `PUT` | `/webhooks/order-state` | Push Order State (uppercase `state`); `POST` remains as an alias. |
| `POST` | `/activation` | Staff action: create the Grab self-serve activation journey and return its URL. |
| `POST` | `/menu/notification` | Staff action: ask Grab to pull the full menu. |

Cron routes (Bearer `CRON_SECRET`):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cron/grabfood/menu-restore` | Durable timed sold-out restoration. |
| `POST` | `/api/cron/grabfood/replay` | Re-drive crashed/failed integration events. |
| `POST` | `/api/cron/grabfood/reconcile` | MY-local daily reconciliation via List Orders. |

### 3. Order contract corrections

- Items map through `items[].id` (Grab's documented partner item ID).
- Order state uses `state` (uppercase values); `toState` remains a legacy fallback.
- `ACCEPTED`, `DRIVER_ALLOCATED`, `DRIVER_ARRIVED` and `BILL_PAID` do not move
  the kitchen status. `COLLECTED` → `picked_up`, `DELIVERED`/`COMPLETED` →
  `delivered`, `CANCELLED`/`FAILED`/`REFUNDED` → `cancelled` when still
  cancellable. The chain is applied through the existing atomic guard.
- Outbound bodies now match the guide: `toState` on acceptance, `markStatus` on
  Mark Ready, `merchantID` + `cancelCode` on cancel, `newOrderReadyTime` on
  ready-time updates, `isPause` (+ optional `duration`) on pause.
- Manual acceptance is gated by `GRABFOOD_ACCEPTANCE_MODE=manual` **and** the
  order's `featureFlags.orderAcceptedType === "MANUAL"`. Automatic stores make
  no acceptance call on the webhook path.
- CASH orders create a `cash` payment with `pending` status; CASHLESS creates a
  `grabfood` payment with `succeeded`.
- `delivery_type` derives from `featureFlags.orderType` (`DineIn` → `dine_in`,
  `TakeAway` → `self_pickup`, otherwise `delivery`); `scheduledTime` sets
  `fulfillment_type = scheduled`.
- Promo arithmetic subtracts **only** `merchantFundPromo`. `basketPromo` is not
  subtracted because Grab's own example defines it as
  `grabFundPromo + merchantFundPromo`.

### 4. Reliability changes

- `integration_events` now carries `attempts`, `locked_until` and
  `next_attempt_at`. Processing claims a 60-second lease; a crash leaves the
  event replayable.
- Event keys are payload hashes, so exact redeliveries dedupe while edited
  orders (new payload, same `orderID`) are applied.
- `apply_channel_order` creates on first sight and updates the same order when
  `featureFlags.isMexEditOrder` is true. A repeat without the edit flag is
  skipped. Financial fields and items update; kitchen status is preserved.
- Submit Order ACKs 2xx only after the canonical write. Unmapped items and DB
  errors return 5xx. An in-flight duplicate returns 503.
- Unknown order-state pushes return 503 so Grab retries; the replay cron is the
  POS-side equivalent.
- Raw customer-bearing payloads are redacted before persistence: phone numbers,
  addresses, coordinates and virtual-contact details are dropped; only the
  receiver name is retained.

### 5. Staff workflow

- The kitchen Mark Ready button now calls
  `/api/integrations/grabfood/orders/[id]/ready` when the order source is
  `grabfood`; other sources keep the admin status route.
- The admin status route also delegates `preparing → ready` for GrabFood orders
  to the same service.
- Mark Ready is once-only: a `grabfood_ready_sent` event blocks a second call.
  A timeout is recorded as `grabfood_ready_uncertain` and is not retried
  automatically; an explicit `{ "retryUncertain": true }` is required after
  checking the Grab merchant app.
- Cancellation goes through `cancelGrabOrder`: eligibility check, Grab call
  with merchant ID + cancel code, local mirror, audit event.

### 6. Menu

- `GET /merchant/menu` builds a selling-time menu from `categories`,
  `menu_items`, `channel_categories`, `channel_products` and modifier groups.
  Only mapped, active categories/items are emitted. Modifier IDs are the local
  modifier UUIDs, giving stable IDs for order callbacks.
- Mapping changes (create/update/delete) call
  `POST /partner/v1/merchant/menu/notification`; failure is returned as a
  warning because the local change is already saved.
- Snoozes are always pushed as `UNAVAILABLE` + `maxStock: 0` and flagged with
  `channel_products.snooze_restore_required`. The restore cron pushes the
  recomputed state at expiry and only then clears the flag. This fixes the
  30-minute snooze that previously became `UNAVAILABLETODAY` (restored at
  Grab's next business day).
- Self-serve activation is exposed in the admin GrabFood page; the activation
  URL must be opened by a Grab Merchant Owner or Store Manager.

### 7. Reconciliation

`/api/cron/grabfood/reconcile` now:

- uses `merchantID` + `date` + `page` and pages until `more === false`;
- uses Malaysia-time day boundaries (UTC+8), not UTC;
- compares subtotal, merchant-funded discount and net merchant total;
- reports missing-local, missing-on-Grab and field mismatches;
- returns 409 in `GRABFOOD_ENV=staging` because Grab documents List Orders as
  unavailable there (override with `?force=1` for a deliberate probe).

## Configuration

Add to the staging environment (see `.env.example`):

```
GRABFOOD_ENABLED=true
GRABFOOD_ENV=staging
GRABFOOD_CLIENT_ID=...            # Grab-issued
GRABFOOD_CLIENT_SECRET=...        # Grab-issued
GRABFOOD_MERCHANT_ID=...          # test store's Grab merchant ID
GRABFOOD_PARTNER_MERCHANT_ID=...  # POS outlet ID
GRABFOOD_PARTNER_CLIENT_ID=...    # POS-issued, given to Grab
GRABFOOD_PARTNER_CLIENT_SECRET=...
GRABFOOD_PARTNER_TOKEN_SECRET=... # optional, >=16 chars
GRABFOOD_ACCEPTANCE_MODE=auto     # or manual, matching the store
GRABFOOD_REQUEST_TIMEOUT_MS=8000
```

Register in the Grab portal: the token URL, the six callback URLs, and the
POS-issued client ID/secret. The OAuth client creation form has no redirect-URI
field; the activation URL is not an OAuth redirect URI.

## Database

`supabase/migrations/066_grabfood_staging_integration.sql` adds:

- `integration_events.attempts/locked_until/next_attempt_at`;
- `grabfood_integrations` (store mapping, activation URL, menu sync state);
- `grabfood_menu_snapshots` (Push Grab Menu exports);
- `channel_products.snooze_restore_required`;
- `apply_channel_order(JSONB)` (create-or-edit RPC);
- service-role/admin RLS policies for the new tables.

**Do not apply this to production.** Apply it to the dedicated staging
Supabase project only, after the staging project is provisioned.

## Verification performed

- `npx vitest run apps/web/src/lib/grabfood apps/web/src/app/api/integrations/grabfood` — 96 tests pass.
- `npx tsc --project apps/web/tsconfig.json --noEmit` — no errors.
- These are unit/contract tests with mocked Supabase and fetch. They do not
  prove Grab staging compatibility.

## Still required before a sandbox test

1. Create the staging OAuth client and store the Grab-issued client ID/secret;
   rotate the project HMAC secret that was shared in chat.
2. Provision the isolated staging app + Supabase project and apply migration
   066 there.
3. Create the Grab test store, record its Grab merchant ID and POS outlet ID,
   and register all callback URLs in the portal.
4. Confirm with Grab: HMAC requirement, manual/auto acceptance, exact callback
   URL fields, test-store credentials, Malaysian tax/promo settlement, and the
   production gate.
5. Run the Grab portal test cases, then the order lifecycle/failure tests in
   the plan. List Orders must be validated in the controlled production pilot.

## Deliberate limitations

- Get Menu emits one all-day selling time. The local catalogue has no
  channel-specific selling-time model yet; Grab accepts 1–20 selling times.
- Order item modifiers are recorded in `order_items.notes` as modifier IDs;
  they are not expanded into `order_item_modifiers` (that table requires a
  local modifier UUID FK and the order payload only carries Grab's ID).
- The replay cron re-drives events; it does not auto-repair a failed order that
  was partially written outside the RPC. The RPC is atomic, so that case should
  not occur.
- Reconciliation compares merchant-food values, not payouts or commissions.
  Payout reconciliation is a separate production-pilot task.
