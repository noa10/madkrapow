# HubboPOS Integration — Mapping Document

> **Status:** DRAFT — awaiting partner API confirmation
> **Created:** 2026-03-31
> **Source:** Public docs at https://developer.hubbopos.com/docs/partnerapi

---

## 1. Authentication

| Aspect | Value |
|--------|-------|
| **Method** | OAuth2 Client Credentials |
| **Token endpoint** | `POST /v1/oauth2/token` (relative to `HUBBOPOS_API_BASE_URL`) |
| **Grant type** | `client_credentials` |
| **Scope** | `mexpos.partner_api` (default, configurable via `HUBBOPOS_SCOPE`) |
| **Credentials** | `client_id` + `client_secret` (from env vars) |
| **Token caching** | In-memory per process, refresh on 401 or expiry |
| **Target identifier** | `merchant_id` (required) |
| **Location identifier** | `location_id` (optional, only if private docs confirm) |

**Pending confirmation from private docs:**
- Token TTL / expiry duration
- Refresh token support vs re-auth on expiry
- Whether `location_id` is a separate concept from `merchant_id`
- Whether multiple merchants/locations per client credentials

---

## 2. API Endpoints (Public Contract)

### 2.1 Menu Retrieval

| Aspect | Value |
|--------|-------|
| **Endpoint** | `GET /merchant/pos/v1/menus` |
| **Auth** | Bearer token (OAuth2) |
| **Query params** | `merchant_id` (required), possibly `location_id` |
| **Response** | Menu payload with categories, items, modifiers |
| **Delta sync** | **NOT confirmed** — assume full pull + diff |

**Pending confirmation:**
- Response schema structure (nested vs flat)
- Pagination support
- Filtering by date/category
- Whether modifiers are nested under items or separate

### 2.2 Order Retrieval (Polling)

| Aspect | Value |
|--------|-------|
| **Endpoint** | `GET /merchant/pos/v1/orders` |
| **Auth** | Bearer token (OAuth2) |
| **Query params** | `merchant_id`, `time_after`, `time_before` |
| **Purpose** | Inbound sync — pull remote order states for reconciliation |
| **Webhooks** | **NOT confirmed** — assume polling only |

**Pending confirmation:**
- Exact param names for time filtering
- Response schema
- Pagination
- Whether order items are included or order-level only

### 2.3 Order Creation

| Aspect | Value |
|--------|-------|
| **Endpoint** | `POST /merchant/pos/v1/order` |
| **Auth** | Bearer token (OAuth2) |
| **Dedupe keys** | `trans_id` + `invoice_no` (canonical pair) |
| **Idempotency header** | `X-Idempotency-Key` — **NOT confirmed**, only send if private docs verify |
| **Purpose** | Push paid MadKrapow orders to HubboPOS |

**Pending confirmation:**
- Full request body schema
- Required fields
- Whether `trans_id` and `invoice_no` are top-level or nested
- Response schema (does it return HubboPOS order ID?)
- Whether update/cancel/refund endpoints exist separately

---

## 3. Catalog Mapping

### 3.1 Categories

| MadKrapow Field | HubboPOS Field (assumed) | Notes |
|-----------------|--------------------------|-------|
| `id` | `hubbo_pos_external_id` | Mapped after sync |
| `name` | `name` | Direct mapping |
| `description` | `description` | Nullable |
| `sort_order` | `sort_order` | If available |
| `is_active` | `is_active` | If available |
| — | `hubbo_pos_source` | Set to `'hubbopos'` |
| — | `hubbo_pos_last_synced_at` | Timestamp of last sync |

### 3.2 Menu Items

| MadKrapow Field | HubboPOS Field (assumed) | Notes |
|-----------------|--------------------------|-------|
| `id` | `hubbo_pos_external_id` | Mapped after sync |
| `name` | `name` | Direct mapping |
| `description` | `description` | Nullable |
| `price_cents` | `price` | HubboPOS may use decimal; convert to cents |
| `category_id` | `hubbo_pos_external_id` (category) | FK resolved via external ID |
| `image_url` | `image_url` | If available |
| `is_available` | `is_available` | Direct mapping |
| `sort_order` | `sort_order` | If available |
| — | `hubbo_pos_sku` | SKU field from HubboPOS |
| — | `hubbo_pos_source` | Set to `'hubbopos'` |
| — | `hubbo_pos_last_synced_at` | Timestamp of last sync |

### 3.3 Modifier Groups

| MadKrapow Field | HubboPOS Field (assumed) | Notes |
|-----------------|--------------------------|-------|
| `id` | `hubbo_pos_external_id` | Mapped after sync |
| `name` | `name` | Direct mapping |
| `description` | `description` | Nullable |
| `min_selections` | `min_selections` | If available |
| `max_selections` | `max_selections` | If available |
| — | `hubbo_pos_source` | Set to `'hubbopos'` |
| — | `hubbo_pos_last_synced_at` | Timestamp of last sync |

### 3.4 Modifiers

| MadKrapow Field | HubboPOS Field (assumed) | Notes |
|-----------------|--------------------------|-------|
| `id` | `hubbo_pos_external_id` | Mapped after sync |
| `name` | `name` | Direct mapping |
| `price_delta_cents` | `price_delta` | HubboPOS may use decimal; convert to cents |
| `is_default` | `is_default` | If available |
| `is_available` | `is_available` | If available |
| — | `hubbo_pos_source` | Set to `'hubbopos'` |
| — | `hubbo_pos_last_synced_at` | Timestamp of last sync |

### 3.5 Sync Strategy

- **Mode:** Full menu pull + diff (no delta endpoint confirmed)
- **Diff logic:** Compare `hubbo_pos_external_id` to detect adds/updates/deletes
- **Deletions:** Mark `is_active = false` rather than hard delete (preserve order history)
- **Read-only mode:** When `hubbo_pos_enabled = true`, admin menu CRUD becomes read-only

---

## 4. Order Mapping

### 4.1 Order Status

| MadKrapow Status | HubboPOS Status (assumed) | Notes |
|------------------|---------------------------|-------|
| `pending` | — | Not pushed to HubboPOS (pre-payment) |
| `paid` | `paid` / `confirmed` | Push to HubboPOS on payment success |
| `accepted` | `accepted` | Sync on admin action |
| `preparing` | `preparing` | Sync on kitchen action |
| `ready` | `ready` | Sync on kitchen action |
| `picked_up` | `picked_up` | Sync on admin action |
| `delivered` | `delivered` / `completed` | Terminal state |
| `cancelled` | `cancelled` | Terminal state |

**Pending confirmation:**
- Exact HubboPOS status enum values
- Whether all MadKrapow statuses have HubboPOS equivalents
- Whether HubboPOS has additional statuses we need to handle

### 4.2 Order Payload (Outbound)

| MadKrapow Field | HubboPOS Field (assumed) | Notes |
|-----------------|--------------------------|-------|
| `id` | — | Not sent; used for local tracking |
| `order_number` | `invoice_no` | Human-readable invoice number |
| — | `trans_id` | Deterministic from order UUID |
| `subtotal_cents` | `subtotal` | Convert cents → decimal |
| `delivery_fee_cents` | `delivery_fee` | Convert cents → decimal |
| `total_cents` | `total` | Convert cents → decimal |
| `customer_name` | `customer_name` | Direct mapping |
| `customer_phone` | `customer_phone` | Direct mapping |
| `status` | `status` | Mapped via status enum |
| `order_items[]` | `items[]` | Each item mapped with SKU/external ID |
| `created_at` | `order_time` | ISO timestamp |
| `delivery_type` | `order_type` | `delivery` / `self_pickup` |
| `scheduled_for` | `scheduled_time` | If applicable |

### 4.3 Order Item Payload

| MadKrapow Field | HubboPOS Field (assumed) | Notes |
|-----------------|--------------------------|-------|
| `menu_item_id` | `item_id` | Resolved via `hubbo_pos_external_id` |
| `menu_item_name` | `item_name` | Snapshot |
| `quantity` | `quantity` | Direct mapping |
| `menu_item_price_cents` | `unit_price` | Convert cents → decimal |
| `line_total_cents` | `line_total` | Convert cents → decimal |
| `notes` | `notes` | If available |
| `order_item_modifiers[]` | `modifiers[]` | Each modifier mapped |

### 4.4 Dedupe Strategy

| Key | Source | Purpose |
|-----|--------|---------|
| `trans_id` | Deterministic hash of order UUID | Primary dedupe key |
| `invoice_no` | Sequential or timestamp-based unique number | Secondary dedupe key |

**Rules:**
- `trans_id` is stable for the lifetime of a MadKrapow order
- `invoice_no` is unique per order (never reused)
- On replay, same `trans_id` + `invoice_no` should be idempotent
- 409/duplicate responses treated as success after read-after-write verification

---

## 5. Payment Mapping

| Aspect | Approach |
|--------|----------|
| **Payment processing** | MadKrapow uses Stripe; HubboPOS is notified of payment result |
| **Payment method** | Mapped from Stripe payment method (card, FPX, GrabPay) |
| **Refunds** | Handled in MadKrapow; HubboPOS notified if separate refund endpoint exists |
| **Pending confirmation** | Whether HubboPOS has separate payment/refund/cancel endpoints |

**Fallback (if no separate payment endpoints):**
- Record local payment truth in MadKrapow
- Reconcile against HubboPOS order-level payment status during sync runs

---

## 6. Tax & Pricing

| Aspect | Approach |
|--------|----------|
| **Currency** | MYR (Malaysian Ringgit) |
| **Precision** | MadKrapow uses integer cents; HubboPOS may use decimal — convert on boundary |
| **Tax** | HubboPOS may include tax in prices; MadKrapow prices are tax-inclusive |
| **Validation** | Never trust client-sent prices; recalculate from DB on checkout |

---

## 7. Error Handling & Resilience

| Scenario | Handling |
|----------|----------|
| HubboPOS unreachable | Queue outbound requests; retry on next sync run |
| 4xx validation error | Mark as permanent failure; log to `hubbopos_api_logs` |
| 409/duplicate | Treat as success after read-after-write verification |
| 429 rate limit | Exponential backoff; retry within same sync run |
| 5xx server error | Retryable; queue for next sync run |
| Circuit breaker open | Skip outbound pushes; log degradation; continue local operations |
| Token expired | Refresh token; retry request |

---

## 8. What We Need From Private/Partner Docs

Priority order:

1. **Full API endpoint list** — Are there update/cancel/refund endpoints beyond the 3 public ones?
2. **Request/response schemas** — Exact field names, types, required fields for menus and orders
3. **`location_id`** — Does it exist? Is it separate from `merchant_id`?
4. **Webhook support** — Can HubboPOS push events to us, or is polling the only option?
5. **Delta sync** — Is there a way to get only changed menu items since a timestamp?
6. **Idempotency header** — Does `X-Idempotency-Key` exist?
7. **Rate limits** — Requests per minute/hour?
8. **Payment endpoints** — Separate payment/refund/cancel calls?
9. **Merchant discovery** — Can we list merchants/locations from credentials?
10. **Error codes** — Full error code list with meanings

---

## 9. Fallback Scope (If Private Docs Unavailable)

If private docs are not available, the integration supports:

1. **Menu mirror** — Full catalog pull from HubboPOS, local serving cache
2. **Paid-order create** — Push orders to HubboPOS after Stripe payment success
3. **Order polling** — Pull order statuses from HubboPOS for reconciliation
4. **Queue replay** — DB-backed queue survives restarts, replays on scheduled sync
5. **Reconciliation** — Compare local vs remote order counts/revenue per date range

This covers the minimum viable integration without update/cancel/refund endpoints or webhooks.

---

## 10. Existing MadKrapow Flows Affected

### 10.1 Checkout Flow
**File:** `src/app/api/checkout/create/route.ts`
- **Current:** Creates local order → creates Stripe session
- **Change:** No HubboPOS push here (order is pre-payment)

### 10.2 Stripe Webhook
**File:** `src/app/api/webhooks/stripe/route.ts`
- **Current:** Marks order as paid → fulfills delivery (Lalamove)
- **Change:** After marking paid, attempt HubboPOS order push; queue on failure

### 10.3 Admin Status Transitions
**Files:** `src/components/admin/StatusTransitionButtons.tsx`, `src/app/admin/kitchen/page.tsx`
- **Current:** Direct browser Supabase writes
- **Change:** Route through new server mutation endpoint `POST /api/admin/orders/[id]/status`

### 10.4 Menu Management
**File:** `src/app/admin/menu/page.tsx`
- **Current:** Full CRUD via browser Supabase client
- **Change:** When HubboPOS enabled, becomes read-only with sync status display

### 10.5 Cron Dispatch
**File:** `src/app/api/cron/dispatch-scheduled/route.ts`
- **Current:** Dispatches scheduled Lalamove orders
- **Change:** New separate cron route for HubboPOS sync (does not interfere)
