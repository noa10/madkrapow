# HubboPOS Integration — Implementation Guide

## Overview

HubboPOS is integrated as a backend-only POS synchronization layer. When enabled, HubboPOS becomes the catalog source of truth, and all paid orders are pushed to HubboPOS automatically.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  MadKrapow  │────▶│  HubboPOS    │────▶│  HubboPOS   │
│  (Next.js)  │     │  Client Lib  │     │  API        │
└──────┬──────┘     └──────┬───────┘     └─────────────┘
       │                   │
       ▼                   ▼
┌─────────────┐     ┌──────────────┐
│  Supabase   │     │  Sync Queue  │
│  (DB)       │     │  (DB-backed) │
└─────────────┘     └──────────────┘
       │
       ▼
┌─────────────┐
│  GitHub     │
│  Actions    │──▶ /api/cron/hubbopos/sync (every 5 min)
└─────────────┘
```

## Data Flow

### Outbound (MadKrapow → HubboPOS)

1. **Checkout** → Stripe webhook marks order as `paid` → immediate HubboPOS push
2. **Admin/Kitchen** status change → server route updates local + HubboPOS (or queues on failure)
3. **Scheduled sync** (GitHub Actions every 5 min) → flushes queue, pulls orders, refreshes catalog

### Inbound (HubboPOS → MadKrapow)

1. **Catalog sync** → `GET /merchant/pos/v1/menus` → normalizes into local tables
2. **Order polling** → `GET /merchant/pos/v1/orders` → reconciliation snapshot
3. **No webhooks** (not confirmed in public docs) — polling only

## File Structure

```
src/lib/hubbopos/
├── auth.ts              # OAuth2 client-credentials, token caching
├── client.ts            # HubboPosClient class (getMenus, getOrders, createOrder, testConnection)
├── transport.ts         # HTTP client with retry, backoff, rate-limit, circuit breaker
├── circuit-breaker.ts   # DB-backed circuit breaker (survives stateless instances)
├── catalog.ts           # Menu sync: full pull + diff, normalize into local tables
├── orders.ts            # Order push: payload construction, dedupe, sync status
├── payments.ts          # Payment reconciliation (local vs remote comparison)
├── queue.ts             # Queue processor: FIFO, permanent vs retryable failure routing
├── sync.ts              # Orchestrator: health check → catalog → orders → queue → reconciliation
├── mappers.ts           # Bidirectional field mappings (HubboPOS ↔ MadKrapow)
├── constants.ts         # API endpoints, status enums, defaults
├── types.ts             # All TypeScript types and custom error classes
└── __tests__/
    ├── mappers.test.ts
    ├── constants.test.ts
    ├── types.test.ts
    └── orders.test.ts

src/app/api/
├── cron/hubbopos/sync/route.ts      # Cron endpoint (GitHub Actions)
├── admin/hubbopos/
│   ├── test-connection/route.ts     # Manual health check
│   └── sync/route.ts                # "Sync Now" trigger
└── admin/orders/[id]/status/route.ts # Server-side status mutation

supabase/migrations/
└── 015_hubbopos_integration.sql     # Schema: extended tables + new tracking tables

.github/workflows/
└── hubbopos-sync.yml                # Scheduled sync every 5 minutes

docs/
└── hubbopos-mapping.md              # Frozen API contract and field mappings
```

## Environment Variables

All credentials stay in Vercel/GitHub secrets only. The admin UI shows masked presence but never raw secrets.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HUBBOPOS_ENABLED` | No | `false` | Feature toggle |
| `HUBBOPOS_API_BASE_URL` | Yes (when enabled) | — | Base URL for HubboPOS API |
| `HUBBOPOS_CLIENT_ID` | Yes (when enabled) | — | OAuth2 client ID |
| `HUBBOPOS_CLIENT_SECRET` | Yes (when enabled) | — | OAuth2 client secret |
| `HUBBOPOS_SCOPE` | No | `mexpos.partner_api` | OAuth2 scope |
| `HUBBOPOS_MERCHANT_ID` | Yes (when enabled) | — | Target merchant ID |
| `HUBBOPOS_LOCATION_ID` | No | — | Optional location ID |
| `HUBBOPOS_SYNC_INTERVAL_MINUTES` | No | `5` | Catalog refresh interval |
| `HUBBOPOS_REQUEST_TIMEOUT_MS` | No | `10000` | HTTP request timeout |
| `HUBBOPOS_MAX_RETRIES` | No | `3` | Max retry attempts |
| `HUBBOPOS_CIRCUIT_BREAKER_THRESHOLD` | No | `5` | Failures before circuit opens |
| `HUBBOPOS_CIRCUIT_BREAKER_RESET_MS` | No | `60000` | Time before half-open |
| `CRON_SECRET` | Yes | — | Secret for cron endpoint auth |

## Database Schema

### Extended Tables

**`store_settings`** — HubboPOS toggle, health status, circuit state, timestamps
**`categories`, `menu_items`, `modifier_groups`, `modifiers`** — `hubbo_pos_external_id`, `hubbo_pos_source`, `hubbo_pos_last_synced_at`
**`orders`** — `hubbo_pos_trans_id`, `hubbo_pos_order_id`, `hubbo_pos_invoice_no`, `hubbo_pos_sync_status`, `hubbo_pos_payment_status`, `hubbo_pos_last_synced_at`, `hubbo_pos_last_error`

### New Tables

**`hubbopos_sync_queue`** — Outbound sync queue (FIFO, retry tracking)
**`hubbopos_api_logs`** — API request/response audit log
**`hubbopos_sync_runs`** — Sync run history and results

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/cron/hubbopos/sync` | `Bearer $CRON_SECRET` | Scheduled sync (GitHub Actions) |
| `POST` | `/api/admin/hubbopos/test-connection` | Admin session | Manual health check |
| `POST` | `/api/admin/hubbopos/sync` | Admin session | "Sync Now" trigger |
| `POST` | `/api/admin/orders/[id]/status` | Admin session | Server-side status mutation |

## Resilience

### Circuit Breaker
- DB-backed state (survives stateless Vercel instances)
- States: `closed` → `open` → `half_open` → `closed`
- Opens after `HUBBOPOS_CIRCUIT_BREAKER_THRESHOLD` consecutive failures
- Resets to `half_open` after `HUBBOPOS_CIRCUIT_BREAKER_RESET_MS`

### Retry Strategy
- Exponential backoff: 1s, 2s, 4s, ...
- Max retries: `HUBBOPOS_MAX_RETRIES` (default 3)
- 429 rate-limit: respects `Retry-After` header
- 4xx validation errors: permanent failure (no retry)
- 5xx errors: retryable (queued for next sync)

### Queue Processing
- FIFO ordering
- 4xx failures → `failed_permanent`
- 5xx failures → retry on next sync run
- Duplicate/409 → success after read-after-write verification
- Survives restarts (DB-backed)

## Deployment Checklist

- [ ] Run migration `015_hubbopos_integration.sql` on Supabase
- [ ] Add all env vars to Vercel project settings
- [ ] Add `CRON_SECRET` to Vercel and GitHub repository secrets
- [ ] Add `NEXT_PUBLIC_URL` to GitHub repository secrets
- [ ] Enable `hubbopos-sync.yml` workflow
- [ ] Regenerate TypeScript types: `npx supabase gen types typescript --project-id <id>`
- [ ] Run full test suite: `npm test`
- [ ] Verify typecheck: `npm run typecheck`
- [ ] Verify lint: `npm run lint`
- [ ] Test connection from admin settings page
- [ ] Trigger manual sync and verify catalog import
- [ ] Create test order and verify HubboPOS push
- [ ] Verify queue survives restart (stop app, check queue table)

## Troubleshooting

### "HubboPOS credentials not configured"
- Check `HUBBOPOS_API_BASE_URL`, `HUBBOPOS_CLIENT_ID`, `HUBBOPOS_CLIENT_SECRET` are set in Vercel

### "Circuit breaker is open"
- Check `store_settings.hubbo_pos_circuit_state` — should auto-reset after `CIRCUIT_BREAKER_RESET_MS`
- Check `hubbopos_api_logs` for recent errors
- Run "Test Connection" from admin settings

### Orders not syncing
- Check `orders.hubbo_pos_sync_status` — `pending` means queued, `failed` means permanent error
- Check `hubbopos_sync_queue` for stuck items
- Check `hubbopos_sync_runs` for last sync results
- Verify `HUBBOPOS_MERCHANT_ID` matches the remote merchant

### Menu not updating
- Check `store_settings.hubbo_pos_last_catalog_sync_at`
- Check `hubbopos_sync_runs` for `catalog_synced` flag
- Verify HubboPOS API returns menu data (test connection)

### Queue growing indefinitely
- Check `hubbopos_sync_queue` for `failed_permanent` items — these won't retry
- Check `hubbopos_api_logs` for error patterns
- Verify HubboPOS API is reachable

## Known Limitations

1. **No delta sync** — Full menu pull each time (no public delta endpoint confirmed)
2. **No webhooks** — Polling only for inbound order status
3. **No update/cancel endpoints** — Status changes are best-effort; queue on failure
4. **No separate payment/refund endpoints** — Payment truth is local; reconciled during sync
5. **Private API unconfirmed** — Some features depend on partner documentation not yet available

## Fallback Scope

If private API docs are not available, the integration supports:
- Menu mirror (full catalog pull)
- Paid-order create (push after Stripe payment)
- Order polling (reconciliation)
- Queue replay (DB-backed, survives restarts)
- Reconciliation reports (local vs remote comparison)
