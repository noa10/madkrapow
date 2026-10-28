# documentation.md — Mad Krapow D2C: Project Status, Decisions & Operator Guide

This is the living document tracking milestone completion, runtime decisions,
verification results, and troubleshooting guidance. Updated after each milestone.

---

## What is Mad Krapow?

Mad Krapow is a direct-to-consumer (D2C) food ordering web application for a Thai street food
restaurant located in TTDI Jaya, Petaling Jaya, Malaysia. It replaces dependency on
Grab/FoodPanda (30% commission) with an owned ordering channel featuring:

- Mobile-first menu browsing with modifier customization.
- Live delivery fee calculation via Lalamove API.
- Secure payment via Stripe (cards, FPX, GrabPay).
- Automated Lalamove driver booking on payment confirmation.
- Real-time order tracking for customers.
- Admin dashboard for kitchen order management, menu CRUD, and analytics.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/mad-krapow/mad-krapow-app.git
cd mad-krapow-app

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp apps/web/.env.local.example apps/web/.env.local
# Fill in all values (see Environment Variables section below)

# 4. Set up Supabase (local or cloud)
npx supabase start          # Local development
npx supabase db reset        # Apply migrations + seed data

# 5. Start development server
npm run dev                  # Opens at http://localhost:3000

# 6. Start Stripe webhook forwarding (separate terminal)
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Verification Commands

```bash
# Development
npm run dev              # Start dev server (localhost:3000)

# Quality Checks
npm run lint             # ESLint — must pass with zero errors
npm run typecheck        # TypeScript strict — must pass with zero errors
npm run test             # Vitest unit tests
npm run test:e2e         # Playwright E2E tests

# Build
npm run build            # Production build (must succeed)
npm start                # Run production build locally

# Database
npx supabase db reset    # Reset DB + apply all migrations + seed
npm run generate-types   # Regenerate shared TypeScript types from schema

# Stripe (local webhook testing)
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Deployment
git push origin main     # Triggers Vercel production deploy
# PRs trigger Vercel preview deploys automatically
```

---

## Milestone Status

| # | Milestone | Status | Completed | Notes |
|---|---|---|---|---|
| M0 | Project Bootstrap & Infrastructure | ⬜ Not Started | — | — |
| M1 | Database Schema & Seed Data | ⬜ Not Started | — | — |
| M2 | Menu Display (Customer-Facing) | ⬜ Not Started | — | — |
| M3 | Item Detail & Modifier Selection | ⬜ Not Started | — | — |
| M4 | Cart State & Cart UI | ⬜ Not Started | — | — |
| M5 | Delivery Address & Lalamove Quote | ⬜ Not Started | — | — |
| M6 | Stripe Checkout & Payment | ⬜ Not Started | — | — |
| M7 | Stripe Webhook & Lalamove Auto-Booking | ⬜ Not Started | — | — |
| M8 | Order Tracking (Real-Time) | ⬜ Not Started | — | — |
| M9 | Authentication & Customer Features | ⬜ Not Started | — | — |
| M10 | Admin Dashboard: Order Management | ⬜ Not Started | — | — |
| M11 | Admin Dashboard: Menu Management | ⬜ Not Started | — | — |
| M12 | Admin: Store Settings & Analytics | ⬜ Not Started | — | — |
| M13 | Email Notifications & SEO | ⬜ Not Started | — | — |
| M14 | Testing, Polish & Production Launch | ⬜ Not Started | — | — |

*Update this table after completing each milestone: ⬜ → 🔄 → ✅*

---

## Decision Log

Decisions made during implementation that deviate from or clarify the original plan.

| Date | Milestone | Decision | Rationale |
|---|---|---|---|
| — | Pre-impl | Build from scratch (not fork Enatega) | Enatega is multi-vendor with proprietary backend. Single-restaurant D2C requires ~10% of that codebase. Next.js + Supabase is direct stack match. |
| — | Pre-impl | Stripe Checkout redirect (not embedded Payment Element) | Simplest PCI compliance path. Handles all MY payment methods (FPX, GrabPay) out of the box. Fewer frontend components to build. |
| — | Pre-impl | Zustand for cart (not Redux, not Context) | Zero boilerplate. Built-in persist middleware for localStorage. ~1KB bundle. |
| — | Pre-impl | All prices in cents (integer) | Prevents floating-point rounding errors. JavaScript integer arithmetic is exact up to 2^53. |
| — | Pre-impl | Denormalize item names/prices into order_items | If a menu item's name or price changes in the future, historical orders should still reflect what was actually ordered and paid for. |
| — | Pre-impl | MOTORCYCLE as default Lalamove service type | 95%+ of food delivery in KL metro is motorcycle. Fastest, cheapest, most driver availability. |
| 2026-04-11 | Infra | Move web app into `apps/web` and extract shared database types to `packages/shared-types` | Establishes a stable monorepo layout for future mobile work while preserving root-level developer commands. |
| 2026-09-29 | POS | Canonical multi-channel order model (`orders.source` widened with counter/grabfood/foodpanda + payments/refunds/channel_orders/channel_products/integration_events tables) | Makes MadKrapow the single source of truth for all sales channels. `channel_orders` UNIQUE(channel, external_order_id) is the webhook idempotency anchor; `import_channel_order`/`import_legacy_order` RPCs make per-order ingestion atomic. No new order statuses — GrabFood maps onto the existing 8-status machine, so `lint:parity` stays untouched. |
| 2026-09-29 | POS | Legacy Aliments POS export imported via audited pipeline (`scripts/import-legacy-pos/`) | 816 orders / 1207 items from Desa Subang Permai (2026-03 → 2026-05): items sum → subtotal (gross), Total Discount → discount, nett → total; refunds become `refunds` rows linked to their original order (never negative orders); every raw row preserved in `legacy_import_records`. Verified: 806 orders + 10 refunds, totals reconcile exactly, re-run skips all (idempotent). |
| 2026-09-29 | POS | GrabFood revenue = subtotal − merchant-funded promos (never `price.total`) | Grab's `price.total` includes delivery fees and Grab's own promo funding; treating it as merchant revenue would break P&L. Reconciliation cron compares item sums, not customer-paid totals. |
| 2026-09-29 | Analytics | Rewrote stale analytics views (048) | 031 filtered on statuses `delivering`/`completed` which do not exist in the live status machine — every delivered order was silently excluded from reports. |
| 2026-10-11 | GrabFood | Corrected batch/menu wire shape to Grab's actual spec: `[{merchantID, field, menuEntities: [...]}]`, ≤ 200 entities per entry; `UNAVAILABLE` requires `maxStock: 0`; `UNAVAILABLETODAY` auto-restores on Grab's side | The groundwork PR pushed a flat record array which the batch endpoint rejects — found by verifying against Grab's official OpenAPI SDK models before building the full-menu push. Same-day sold-out rides `UNAVAILABLETODAY` so Grab restores items without another push (Hubbo's snooze pattern). |
| 2026-10-11 | GrabFood | Auto-accept orders inside the submit-order webhook after a successful local import (+ 20-minute ready-time promise) | Closes the top pre-launch gap: Grab may auto-cancel orders the partner never accepts. The order is canonical locally first, so a Grab-side acceptance failure is recorded (`order_events grabfood_accept_failed`) without failing the webhook. |
| 2026-10-11 | Printing | ESC/POS bytes are rendered server-side from canonical orders and delivered by a dependency-free Node bridge on the restaurant LAN (poll claim + localhost /print) | Vercel serverless cannot reach a LAN printer and browsers cannot open raw TCP. Claim-time `order_events printed_<type>` markers give exactly-once printing (Hubbo's already-printed dedup); reprints go through the render endpoint with a REPRINT watermark. |
| 2026-10-11 | GrabFood | Interim pre-onboarding path = unofficial Hubbo merchant backend adapter (`lib/hubbo-merchant/`), env-gated and default-off | Reverse engineering showed the Hubbo app holds no GrabFood credentials — Hubbo's backend mediates GrabFood. The adapter pulls the full menu (incl. `grabfoodPrice`) and pushes sold-out via `snoozeMenu` using the RE-proven device-login → `apiKey` scheme; source-tagged `aliments_backend` rows keep it separate from the DRAFT developer-API integration. |
| 2026-10-13 | Infra | Scheduled PR auto-update bot (`.github/workflows/pr-autoupdate.yml`) | PR #399 landed 29 commits behind master with green CI on the old base — stale-branch staleness masks real integration failures. The bot updates every open non-draft same-repo PR whose base moved (`gh pr update-branch` re-triggers CI), reports conflicts, skips drafts/forks. Behindness comes from the compare API (`behind_by`), **not** `mergeStateStatus === 'BEHIND'`: GitHub only reports that when branch protection requires up-to-date branches, and this repo has none — so #399 reported `CLEAN` at 29 behind and behind Dependabot PRs report `UNSTABLE`. Trusting it made the bot a silent no-op (verified: 0 PRs updated instead of 4). Needs an `AUTO_UPDATE_TOKEN` PAT secret (GITHUB_TOKEN pushes don't re-trigger CI) and the "Allow updating pull request branches" repo setting. |
| 2026-10-14 | GrabFood | Descoped the full-menu batch push (`lib/grabfood/push.ts` + `POST /menu/sync`) and removed its dead scaffolding | The throttled runner landed via #420 with an unanswered "is this still wanted?" review question. Now consciously descoped rather than accidentally dropped: the menu is maintained on Grab's side at onboarding, so the only menu writes needed are per-item availability (`PUT /partner/v1/menu`, used by snooze) and the order lifecycle. Removed with it: the sync route, the admin "Sync menu" button, `fetchGrabMenuMappings`, `toBatchMenuEntries`, `batchUpdateMenuRecords`, `notifyMenuUpdated`, `GrabBatchMenuEntry`/`GrabMenuEntity`; the review follow-up also dropped the never-consumed category-level fetcher (`fetchChannelCategoryMappings`/`ChannelCategoryMappingRow`) and the write-only category fields on `GrabMenuMappingRow`. Kept: mapping CRUD, snooze, read-only menu trace, store pause. **Local-only contract made explicit** (review #423): `PATCH /menu/mapping` price/availability edits are saved locally — the catalogue is maintained on Grab's side, so no route pushes a price edit on its own; a stored price rides the next per-item write (snooze/restore). Route docstrings, admin copy and docs now say so. |

| 2026-10-27 | POS | Dine-in POS: `restaurant_tables` + `orders.table_id/table_label/pax`, `delivery_type='dine_in'`, public table-QR ordering (`/t/<token>`), POS table board, settle/close RPCs | Merchant staff key dine-in (table + pax) and take-away (name) orders at `/pos`; diners order from a table QR without logging in. QR orders are `pending` (pay at counter) so the kitchen starts immediately; cashier settles to `paid`; closing a table requires every open order `ready` and moves them to `picked_up` (superseded 2026-10-28 — see the migration 061 row below). No new statuses (`lint:parity` untouched). Migration 057 also drops the legacy anonymous `auth_insert_orders` policy; settle/close RPCs are service-role only. |

| 2026-10-27 | POS | Optional payment for POS orders: pay now (cash / company DuitNow QR) or pay later; card disabled; migration 058 broadens settlement to counter orders | Staff can send a dine-in or take-away ticket to the kitchen before payment (`pending` with no payment row). Pending counter orders are kitchen-active and print a docket; the cashier collects later from the table board or the Unpaid take-away strip. Card stays disabled until a terminal integration. The company QR asset is public and receive-only. |

| 2026-10-27 | POS | POS menu supports modifiers/add-ons like the online menu; server re-validates and snapshots them | Customizable dishes open an options dialog with the shared modifier UI and special instructions. Cart lines are keyed by dish + add-ons + note; the API re-validates membership/required/max, re-prices deltas, and writes `order_item_modifiers`, so crafted POS payloads cannot bypass required options or prices. |
| 2026-10-27 | POS | Payment recording fix: seeded database IDs are validated with `z.guid()` instead of `z.uuid()`; dev toasts no longer remove themselves on unmount | Zod 4 rejects the seeded `00000004-…` IDs (UUID version nibble 0), which silently 400'd every POS and table-QR order; the StrictMode toast cleanup hid the error in dev. Cookie auth replaces the per-tap `getSession()` round-trip, and a failed payments insert rolls the order back so a retry cannot duplicate a paid ticket. |
| 2026-10-28 | POS | Grouped table collection: `settle_dine_in_table` (migrations 059/060) settles every pending dine-in order at a table atomically; one total and one Collect on the table card and sale panel; order items expand inline | The ledger keeps one `payments` row per order; the badge counts tables to collect, not unpaid orders. The call carries the confirmed order ids — a round added or paid during the confirm window returns `stale_settle` (409) without writing, so the cashier is never charged for a total they did not see. Migration 059 also restores `order_events.actor_id`, missing in the live schema, which made every settle/close RPC fail with `42703`. |

| 2026-10-28 | POS | Closing a dine-in table is gated on the bill, not the kitchen (migration 061): `close_dine_in_table` closes once no ticket is `pending` and completes any still-cooking ticket to `picked_up` | Requiring `ready` (057) stranded every pay-now table: the POS — the only screen a cashier uses — has no control that moves `paid → preparing → ready`, so a settled table could never be closed. Each ticket now records the status it came from and `reason: 'table_closed'`; no synthetic preparing/ready history is written. The confirm dialog warns how many orders are still in the kitchen before completing them. |

| 2026-10-28 | POS | Close carries the confirmed order set (migration 062): `close_dine_in_table(p_table_id, p_actor_id, p_expected_order_ids)` returns `stale_close` (409) when the table's open set differs from the ids the dialog listed | 061 completed whatever was open at execution time, so a round that landed while the confirm dialog was open was completed unseen — the same class as `stale_settle`, fixed the same way. The comparison also covers counter inserts, which never take the table's advisory lock: a ticket inserted between the unpaid check and the completion loop changes the set and the close is refused. The 2-arg overload is dropped, so the previous web build's Close button fails until the snapshot-aware build is live — migration and code deploy together. |

| 2026-10-28 | POS | Table-QR orders are idempotent, and the 10 s per-table gap is gone (migration 063): `orders.idempotency_key` with a partial unique index; `delete_restaurant_table` does the history check and delete atomically | A lost response made the diner's retry either fail with `table_order_too_soon` (the order had landed) or, after 10 s, create a duplicate ticket staff could not distinguish from a real extra round. The page now sends a key per submission; a retry returns the original order (200, `duplicate: true`) even when the table is at its cap, and the unique index settles concurrent duplicates. The 10 s gap also rejected an ordinary second diner and had to go for the index to be reachable; 4 / 5 min remains. The delete route's count-then-delete TOCTOU is replaced by one RPC that locks the table row, so a concurrent counter order cannot be orphaned by `ON DELETE SET NULL`. |

| 2026-10-28 | POS | Floor-plan audit trail and atomic deactivation (migration 064): `table_events` records create/edit/activate/deactivate/token-rotate/delete with the actor; `deactivate_restaurant_table(p_table_id, p_actor_id)` locks the table row and refuses while open orders exist; `delete_restaurant_table` now takes the actor; `enforce_dine_in_table_active` rejects an order racing a deactivation | Rotating a QR token invalidates every printed code, and deactivating/deleting changes what the floor accepts, but none of them left a record (`order_events` is FK'd to `orders`). The deactivate route also counted open orders and wrote `is_active` in two statements — the same TOCTOU 063 fixed for DELETE; the RPC closes it, and the insert-side trigger closes the other direction (an order that passed the route's active check waits on the row lock and is rejected once the deactivation commits). The rate-limit scope is unchanged and now explicit: anonymous QR orders only, so a table's own counter rounds cannot exhaust the diners' cap. |

*Add rows as decisions are made during implementation.*

---

## Repository Structure

```
mad-krapow/
├── docs/                    # This documentation pack (5 files)
│   ├── prompt.md            # Project spec and goals
│   ├── plans.md             # Milestones, risks, demo script
│   ├── architecture.md      # System architecture + codemap
│   ├── implement.md         # Execution prompt for Codex/agent
│   └── documentation.md     # THIS FILE — status + decisions
├── apps/
│   └── web/                 # Next.js application workspace
│       ├── src/             # App source
│       ├── public/          # Static assets (icons, manifest)
│       ├── middleware.ts    # Next.js middleware entrypoint
│       └── .env.local.example
├── packages/
│   └── shared-types/        # Generated Supabase types shared across workspaces
├── supabase/                # Database migrations and seed data
├── e2e/                     # Playwright end-to-end tests
└── scripts/                 # Build and maintenance scripts
```

See `docs/architecture.md` for the complete, detailed codemap.

---

## Environment Variables Reference

| Variable | Required | Format | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | JWT | Supabase anonymous key (safe for client) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | JWT | Supabase service role key (SERVER ONLY) |
| `STRIPE_SECRET_KEY` | ✅ | `sk_*` | Stripe secret key (SERVER ONLY) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | `pk_*` | Stripe publishable key (safe for client) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | `whsec_*` | Stripe webhook signing secret |
| `LALAMOVE_API_KEY` | ✅ | string | Lalamove Partner Portal API key |
| `LALAMOVE_API_SECRET` | ✅ | string | Lalamove HMAC signing secret |
| `LALAMOVE_ENV` | ✅ | `sandbox` or `production` | Lalamove environment |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | ✅ | `AIza*` | Google Maps JavaScript API key |
| `NEXT_PUBLIC_URL` | ✅ | URL | Public app URL (for Stripe callbacks) |
| `RESEND_API_KEY` | ✅ | `re_*` | Resend email API key |
| `STORE_LATITUDE` | ✅ | float | Mad Krapow pickup location latitude |
| `STORE_LONGITUDE` | ✅ | float | Mad Krapow pickup location longitude |
| `STORE_ADDRESS` | ✅ | string | Mad Krapow full address string |
| `STORE_PHONE` | ✅ | `+60*` | Restaurant phone number |
| `SENTRY_DSN` | ⬜ | URL | Sentry error tracking DSN (optional for dev) |

**Security rules:**
- Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser. Only put safe, public values here.
- `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `LALAMOVE_API_SECRET`, `STRIPE_WEBHOOK_SECRET` must NEVER be prefixed with `NEXT_PUBLIC_`.
- All variables are validated at build time via Zod (see `apps/web/src/lib/validators/env.ts`).

---

## Database Schema Summary

12 tables, all with RLS enabled:

| Table | Rows (Seed) | Key Relationships |
|---|---|---|
| `store_settings` | 1 | Singleton config |
| `categories` | ~6 | Parent of menu_items |
| `menu_items` | ~25 | Belongs to categories; linked to modifier_groups via join table |
| `modifier_groups` | ~8 | "Spice Level", "Protein", "Add-ons" etc. |
| `modifiers` | ~30 | Belongs to modifier_groups |
| `menu_item_modifier_groups` | ~40 | Many-to-many join |
| `customers` | 0 | Extends auth.users |
| `customer_addresses` | 0 | Belongs to customers |
| `orders` | 0 | Core order record; links to Stripe + Lalamove IDs |
| `order_items` | 0 | Belongs to orders; denormalized names/prices |
| `order_item_modifiers` | 0 | Belongs to order_items |
| `promo_codes` | 0 | Future feature (schema ready) |

To regenerate TypeScript types after schema changes:
```bash
npm run generate-types
```

---

## Key Integration Notes

### Stripe
- **Mode:** Checkout Sessions (redirect flow).
- **Currency:** MYR (Malaysian Ringgit).
- **Payment Methods:** card, fpx, grabpay.
- **Webhook:** `checkout.session.completed` → triggers order fulfillment.
- **Test card:** `4242 4242 4242 4242`, any future date, any CVC.
- **Local testing:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### Lalamove
- **API Version:** v3.
- **Market:** MY (Malaysia).
- **Auth:** HMAC-SHA256. Signature = `HMAC(apiSecret, "{timestamp}\r\n{method}\r\n{path}\r\n\r\n{body}")`.
- **Service type:** MOTORCYCLE.
- **Quotation TTL:** 5 minutes. Re-quote if older than 4 minutes before placing order.
- **Sandbox base URL:** `https://rest.sandbox.lalamove.com`
- **Production base URL:** `https://rest.lalamove.com`

### Supabase Realtime
- **Customer tracking:** Subscribe to `postgres_changes` on `orders` table filtered by order ID.
- **Admin feed:** Subscribe to `postgres_changes` on `orders` table (INSERT + UPDATE).
- **Requires:** Realtime enabled on `orders` table in Supabase dashboard.

### Google Maps
- **APIs required:** Maps JavaScript API, Places API, Geocoding API.
- **Restriction:** HTTP referrer restriction to app domain(s).
- **Billing:** Pay-as-you-go; first $200/month free covers ~28,000 autocomplete requests.

---

## Troubleshooting

### "Supabase connection refused" on local dev
```bash
# Ensure Supabase is running locally:
npx supabase status
# If not running:
npx supabase start
```

### Stripe webhooks not arriving locally
```bash
# Ensure Stripe CLI is forwarding:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the webhook signing secret (whsec_...) to apps/web/.env.local
```

### Lalamove quotation returns 401
- Verify HMAC signature generation matches Lalamove's expected format.
- Ensure timestamp is in ISO 8601 format with timezone.
- Check that API key/secret are for the correct environment (sandbox vs production).

### "RLS policy violation" when creating orders
- Guest checkout (no auth): ensure INSERT policy allows `customer_id IS NULL`.
- Authenticated: ensure the JWT is being passed correctly via Supabase client.
- Webhook operations: ensure `service_role` key is used, not anon key.

### Google Maps autocomplete not showing suggestions
- Verify `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is set and the Places API is enabled.
- Check browser console for quota/billing errors.
- Ensure API key has correct HTTP referrer restrictions.

### Build fails with "missing environment variables"
- All env vars are validated by Zod at build time (`src/lib/validators/env.ts`).
- Copy `.env.local.example` and fill in all values.
- For Vercel: add all variables in Project Settings → Environment Variables.

---

## Post-Launch Monitoring Checklist

- [ ] Sentry: error alerts configured (email + Slack).
- [ ] Vercel Analytics: performance dashboard bookmarked.
- [ ] Stripe Dashboard: webhook delivery success rate > 99%.
- [ ] Lalamove: monitor order completion rate.
- [ ] Supabase: database size and connection pool utilization.
- [ ] Google Maps: monthly API usage vs. free tier threshold.
- [ ] Uptime monitoring: set up Vercel / Better Uptime ping for order.madkrapow.com.

---

*This document is updated after each milestone completion. Last updated: project initialization.*
