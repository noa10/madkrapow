# MEMORY.md — Mad Krapow Long-Term Memory

This file contains curated memories, decisions, and learnings that persist across sessions. This is your long-term memory — the distilled essence of what matters.

**Last Updated**: 2026-10-14

---

## Project Overview

**Mad Krapow** is a single-restaurant D2C food ordering web app built with Next.js 16, Supabase, Stripe, and Lalamove. The customer orders Thai street food online, pays via Stripe, and delivery is automatically booked through Lalamove. The kitchen manages orders via a real-time admin dashboard.

**Status**: In development, following 14-milestone execution plan (docs/plans.md)

---

## Key Architectural Decisions

### 2026-03-17: ECC Integration
- **Decision**: Merged ECC (Everything Claude Code) agent harness patterns into the project
- **Rationale**: ECC adds behavioral frameworks and persistent memory
- **Implementation**: Created SOUL.md, MEMORY.md, HEARTBEAT.md; enhanced AGENTS.md with ECC patterns
- **Impact**: AI assistants now have session continuity and defined working style

### 2026-09-26: GitNexus removed
- **Decision**: Dropped GitNexus code-intelligence tooling; the project is no longer indexed by it
- **Rationale**: Not in active use. The mandatory `gitnexus_impact` / `gitnexus_detect_changes`
  gates were unenforceable — the MCP tools were not available in agent sessions, so the rules
  could not be followed as written
- **Implementation**: Deleted CLAUDE.md (was entirely a GitNexus block); removed the
  `gitnexus:start`/`gitnexus:end` block from AGENTS.md and the `.gitnexus/` .gitignore entry;
  rewrote the inline GitNexus references in AGENTS.md, SOUL.md, TOOLS.md and MEMORY.md to
  tool-neutral wording. The underlying behavioural intent of each rule was preserved
- **Impact**: No build, test or runtime change. Docs-only

### Project Inception: Technology Stack
- **Next.js 14+ App Router**: SSR/RSC for SEO, Server Actions for mutations
- **Supabase**: PostgreSQL with RLS, Realtime subscriptions, Auth
- **Stripe**: Checkout Sessions (redirect flow) for PCI compliance
- **Lalamove**: MOTORCYCLE service type for KL food delivery
- **Prices in cents**: All monetary values as integers (RM 12.50 = 1250) to avoid floating-point errors

### Project Inception: Security Model
- **Never trust client prices**: Checkout endpoint re-fetches all prices from database
- **Webhook signature verification**: Both Stripe and Lalamove webhooks verified before processing
- **RLS everywhere**: Every Supabase table has Row-Level Security policies
- **Service role for webhooks only**: Admin operations use service_role key that bypasses RLS

### 2026-03-27: Checkout Workflow Fixes
- **Address Selection**: Fixed redirect to home page by implementing an inline address input toggle.
- **Bulk Ordering**: Relaxed Zod validation for bulk orders to allow optional fields for initial review.
- **API Reliability**: Added defensive JSON parsing and detailed validation error reporting to the checkout creation endpoint.

### 2026-09-29: Single-Source-of-Truth POS (channels, legacy import, GrabFood)
- **Decision**: Made MadKrapow the canonical POS for all sales channels. Migrations
  048–052 add the channel model (`orders.source` + counter/grabfood/foodpanda,
  `payments`, `refunds`, `channel_orders`, `channel_products`, `integration_events`,
  `legacy_import_*`), fix the stale analytics views, and add atomic import RPCs.
- **Legacy import**: Aliments POS export (816 orders / 1207 items, Desa Subang
  Permai, 2026-03→2026-05) imported via `scripts/import-legacy-pos/` — verified
  reconciled to the sen, idempotent (re-run skips all), raw rows in
  `legacy_import_records`. Refunds are `refunds` rows, never negative orders.
- **GrabFood**: `lib/grabfood/` + webhook routes (submit-order, order-state) +
  mark-ready/cancel/menu mapping+snooze+trace admin routes + reconciliation cron. Mock transport
  (`GRABFOOD_ENV=mock`) allows full local testing without Grab credentials.
- **Key semantics**: money = integer sen everywhere (Grab MYR exponent 2
  compatible); GrabFood order revenue = subtotal − merchant-funded promos
  (never `price.total`, which includes delivery fees); no new order statuses —
  channel states map onto the existing 8-status machine so `lint:parity` holds.
- **Impact**: webhook idempotency anchored on
  `channel_orders UNIQUE(channel, external_order_id)`; admin UI source filters
  and badges cover the new channels; `/pos` counter screen live.

### 2026-10-11: GrabFood full-menu push + LAN printing (Hubbo RE)
- **Decision**: Built on `feat/grabfood-menu-printing` (stacked on
  `feat/pos-canonical-orders`). Reverse-engineered the Hubbo POS APK
  (`/Users/khairulanwar/dev/hubbo`, findings in `docs/hubbo-re-findings.md`):
  the app has NO GrabFood credentials — Hubbo's backend
  (`api.aliments.my/alimentsBackend`, device login → `apiKey` header)
  mediates GrabFood via "GRABFOOD ROBOT" workers.
- **GrabFood spec corrections** (verified against Grab's official OpenAPI
  SDK): batch/menu is `[{merchantID, field, menuEntities: [...]}]` ≤ 200
  entities/entry (flat arrays are rejected); `UNAVAILABLE` requires
  `maxStock: 0`; `UNAVAILABLETODAY` auto-restores at Grab's next business day.
  The batch push runner (1 req/s, backoff, resumable cursor) was **descoped** on
  2026-10-14 — see the entry below. Accept
  order (`POST /partner/v1/order/prepare`) now fires inside submit-order after
  a successful import (closes pre-launch gap #1).
- **Snooze**: `snooze_till` (migration 053) computed at read time; same-day
  snoozes push `UNAVAILABLETODAY`, longer ones push `UNAVAILABLE`+maxStock 0.
  Admin page `/admin/grabfood` covers mapping, snooze presets, trace,
  store pause.
- **Printing**: pure ESC/POS generator (`lib/printing/escpos.ts`, 32/42/48
  cols) + job builders; delivery via `scripts/print-bridge/` Node agent on the
  LAN (poll claim; exactly-once via `order_events printed_<type>` markers;
  localhost /print for manual reprints). Vercel cannot reach LAN printers —
  the bridge is the delivery path.
- **Interim Hubbo adapter**: `lib/hubbo-merchant/` (UNOFFICIAL, env-gated,
  default off) pulls the full menu and pushes sold-out before official Grab
  onboarding; needs a one-time apiKey capture from a real POS device.

### 2026-10-14: GrabFood full-menu push consciously descoped
- **Decision**: Removed the throttled full-menu batch runner
  (`lib/grabfood/push.ts`), `POST /api/integrations/grabfood/menu/sync`, and the
  code only they reached (`fetchGrabMenuMappings`, `toBatchMenuEntries`,
  `GrabFoodClient.batchUpdateMenuRecords`/`notifyMenuUpdated`,
  `GrabBatchMenuEntry`/`GrabMenuEntity`) plus the admin "Sync menu" button.
- **Why**: the push landed via #420 with an open "is this still wanted?"
  question (raised in that PR's review ask, never answered). It is now
  *consciously* descoped rather than accidentally dropped: the menu is set up on
  Grab's side at onboarding, so the only menu writes needed are per-item
  availability (`PUT /partner/v1/menu`, used by snooze) and the order
  lifecycle.
- **Kept**: mapping CRUD, snooze, the read-only menu trace, store pause, and the
  single-item push used by snooze — all independent of the batch runner.
- **Review follow-up (#423)**: the *local-only contract* is now explicit in the
  `PATCH /menu/mapping` docstring, the `/admin/grabfood` copy, and the docs — a
  price/availability edit is saved locally and only reaches Grab as part of the
  next per-item write (snooze/restore carries price + availability together);
  no route pushes a price edit on its own. Also dropped the never-consumed
  category scaffolding (`fetchChannelCategoryMappings` +
  `ChannelCategoryMappingRow`) and the write-only
  `menu_item_category_id`/`external_category_id` fields on `GrabMenuMappingRow`.
  The trace button is **kept** as read-only diagnostics (answers review ask #2).

### 2026-10-14: Log sanitiser is now one shared module
- **Decision**: All untrusted values reach loggers through a single
  `sanitizeForLog` (`apps/web/src/lib/logging/safe-log.ts`), not per-route copies.
  It strips `\n|\r` (the CWE-117 vector), ANSI escapes, C0/C1 controls and
  U+2028/U+2029, and bounds length; it accepts `unknown` so optional/error fields
  need no narrowing.
- **Rationale**: The identical 3-line helper had been copy-pasted into four
  routes, and a fifth sink (GrabFood `submit-order`) had none at all — which is
  exactly how CodeQL alert #57 was missed. Duplication was the root cause.
- **Impact**: CodeQL reports 0 log-injection alerts on the fixing branch. Any new
  call site must import the shared helper; do not inline a private copy.
- **Note**: A webhook signature check is *not* log-injection protection. The
  signed-partner path is authenticated but still attacker-shaped.

### 2026-10-14: GrabFood work dropped by the #399 squash — recovered
- **Decision**: Recovered the 19 commits that were stacked on
  `feat/pos-canonical-orders` (squash-merged as `4dd43f2`) but never merged.
  Printing/hubbo went over in #418; the GrabFood remainder is PR #420.
- **How to tell squash-loss from ancestry noise** (important): `git cherry` and
  `git merge-base --is-ancestor` are *useless* after a squash — a squash never
  makes source commits ancestors, so every stacked commit shows `+`. Compare
  **content** instead. Master's `lib/grabfood/` is byte-identical to the
  `pos-canonical` tip `9f12691`, which proved the squash captured the base
  branch *fully* and the loss was confined to the 19 stacked commits.
- **Highest-impact item**: `d680699` — accept the order on Grab after import.
  Master had no `acceptOrder` call at all, and Grab auto-cancels unaccepted orders.

### 2026-10-19: Storefront design system port ("Fiery Wok" crimson) — shipped in PR #450
- **Decision**: Ported the approved OpenDesign artifact into `apps/web` as the
  storefront visual system: crimson default accent, ember/sesame/herb support
  colors, Plus Jakarta Sans, topbar shell (replaces the client sidebar), design
  hero/menu tiles/cart/checkout styling, account pages migrated to the shell.
- **Single source of truth**: `apps/web/src/app/globals.css` (`@theme` block).
  Tailwind v4 — `tailwind.config.ts` is dead code (no `@config`), do not touch.
  Legacy token names (`bg-primary`, `text-gold`, `var(--gold-strong)`,
  `var(--line-strong)`) were remapped, so swapping back to app gold is a
  one-block edit in `globals.css`.
- **Committed on request** as `f0cbe2b` (base `c11577e`) on
  `feat/fiery-wok-storefront-redesign`; PR #450. Follow-ups: `7656e58`
  (required options), `50d7a83` (required CTA overflow), then the
  review-pass fixes (hydration gate, dialog semantics/focus, logo WebP).
- **Dead files**: `AboutView` / `OrderView` / `Hero` / `ClientSidebar` /
  `Header` / `Footer` / `ProfileDropdown` are unused — not restyled.
- Checks at hand-off: typecheck clean; lint 33 warnings / 0 errors (baseline);
  Tailwind compile probe verified all new utilities emit. Vitest full-suite
  failures are pre-existing (alias resolution + Windows worker crashes) and no
  test touches the ported components.
- **Follow-up (same day, user request)**: Menu is now the single ordering
  surface — "Quick order" pill removed from the topbar (`/order` route kept
  alive). The menu category rail now follows the scroll like Rigatony's
  (owner.com pattern): click scrolls the section under the bars, the active
  pill highlights instantly and auto-centers, `?category=` deep links land
  correctly.
- **Gotcha learned**: `overflow-x-hidden` on `ClientPageShell`'s `<main>` was
  silently breaking `position: sticky` for descendants (it turns the ancestor
  into a scroll container). Fixed with `overflow-x-clip` — never reintroduce
  `overflow-x-hidden` on that element.
- **Gotcha learned (2)**: `position: sticky` establishes a stacking context.
  The item-image zoom modal was rendered inside the `lg:sticky` image
  `<aside>`, so its `fixed … z-[60]` overlay was trapped in that context and
  painted under later-DOM siblings — the customize `<section>` (its
  `fade-in-up` animation retains `transform: translateY(0)` via
  `fill-mode: both`, so it paints like a positioned z-0 box). Fix: the modal
  is `createPortal`ed to `document.body` at `z-[70]` (lightbox = topmost
  layer; topbar/bottom bar `z-30`, drawer `z-40/50`, toasts `z-60`). Rule:
  never render a fixed overlay from inside a sticky/transformed/animated
  ancestor — portal it to body.
- **Topbar logo**: static `public/madkrapow-logo.svg` at `h-12` / `md:h-14`,
  text lockup removed (logo carries the name). `unoptimized` is required — a
  string-src SVG through `next/image` hits `/_next/image`, which rejects SVGs
  (400); the old `unoptimized={!!logoUrl}` fallback rendered broken whenever
  no `store_branding` row existed. The file is ~904KB (raster-in-SVG);
  optimizing it is a recorded follow-up.
- **Halal removed sitewide** (same day, user request): deleted
  `HalalCommitmentSection` + `HalalBadge` components, "Halal" nav pill, and
  all halal copy on hero/menu/about. Home order is now hero → how-to-order →
  how-it-works. Kept "No pork, no lard" / "Muslim-friendly kitchen" (not the
  word "halal"). If live DB menu descriptions mention halal, that's a
  separate data sweep.
- **Menu page now Rig A' Tony's-style** (owner.com pattern): `lg+` sticky
  left sidebar (search + vertical category list with counts, scroll-spy +
  auto-center), mobile keeps search-under-title + sticky pill rail; search
  filters name/description and hides empty categories; `RichMenuGrid` is
  layout-agnostic now (page padding owned by the two-column wrapper) with
  `md:grid-cols-2` cards.
- **Menu cards restyled to owner.com layout** (same day): text left / photo
  right with a floating round "+" (light circle, `bg-foreground`), price at
  the column bottom; grid `md:grid-cols-2`; photo `w-28 sm:w-32 xl:w-40`,
  card `min-h-[120px] sm:min-h-[136px]`. Whole card is clickable via a
  stretched `inset-0` trigger (the "+" is decorative, pointer-events-none).
  `SpiceLevel` renders nothing at level 0 — no more "Mild" chip.
  `Add +`/`Added ✓` labels untouched (they live in `MenuItemCard` / `/order`).
- **Site footer** (same day, user request): `ClientFooter` rendered by
  `ClientPageShell` on all shell pages. 4 columns — brand (logo only +
  blurb), Menu (category deep links `?category=`; slugs verified against
  the live DB: `bazar-ramadan-ttdi-jaya`, not the design's `bazar-ramadan`),
  Visit & hours, Ordering — plus © row with "Locally sourced ingredients"
  (herb) / "Lalamove delivery" (ember) seals. Halal-free copy throughout.
  `pb-[104px] lg:pb-0` = the design's `.padforbar`; the always-on item-page
  bar overlaps the bottom row at lg full-scroll (accepted, minor).
- **Menu category click fix**: never `router.replace/push` in the same tick
  as a programmatic smooth scroll while a `loading.tsx` exists — the soft
  navigation swaps in the skeleton, collapses the page, and aborts the
  scroll ("first click dead, second click works"). The `?category=` URL is
  now updated via native `window.history.replaceState` (supported in the
  App Router).
- **Card z-index rule**: `RichMenuCard` carries `isolate`. Its stretched
  trigger (z-10) and "+" badge (z-20) are contained in the card's stacking
  context; without `isolate` they leak to the root context, tie the sticky
  category rails (z-20), and — because cards come later in the DOM — paint
  over the rails. Don't remove it; page chrome stays rail z-20 < topbar
  z-30 < quick view z-[35] < drawer z-40/50 < toasts z-60 < image lightbox
  z-[70].
- **Item detail image is `object-contain`** (preview box + zoom modal): the
  full photo must be visible — the frame letterboxes on `bg-surface-sunk`.
  Do not switch the preview back to `object-cover` (it crops the photo —
  user-reported).
- **Menu quick view (dialog, same day, user request)**: clicking a menu card
  no longer navigates to `/item/[slug]` — it opens `ItemQuickView`, a
  body-portaled dialog (`z-[35]`, bottom sheet on mobile) with the full
  customization UI and add-to-cart. Card + signature-hero CTA are now
  buttons (`aria-haspopup="dialog"`), not links; the `/item/[slug]` pages
  still exist for deep links/direct visits. Ordering state/validation/pricing
  live in the shared `useItemOrder` hook (item page + dialog) — never
  duplicate that logic in a new surface. Adding from the dialog closes it;
  the cart drawer does NOT auto-open on add (user request — feedback is the
  toast + the topbar count; open the cart explicitly via the topbar
  button). The dialog's Esc handler yields to the image lightbox when it is
  open on top.
- **Menu card badge = live in-cart count** (same day, user request): the
  floating circle on each `RichMenuCard` shows `+` at 0 and the item's
  total quantity in the cart (all modifier variants summed) at >0 as a
  `bg-primary` circle, owner.com style. Implemented as a primitive zustand
  selector so a card only re-renders when its own count changes. The badge
  stays decorative/pointer-events-none (the stretched button opens the
  quick view) and the stretched button's aria-label gains ", N in cart".
- **Quick-view layout = the owner.com reference the user supplied** (same
  day, second pass): full-bleed photo band (`aspect-[3/2]`, `object-cover`)
  with a floating white ✕ button, `max-w-[640px]` card, name (26px) +
  description, hairline dividers, footer = qty stepper box + `Add item
  RM x.xx ›` solid `bg-primary` button. The cover crop is deliberate here
  (the reference shows a filled photo band) and scoped to `ItemImagePreview
  variant="banner"`; the item-page preview keeps `object-contain` (rule
  above still stands). Option rows deliberately use the shared bordered
  checkbox/radio `ModifierGroup` cards — a compact owner.com-style `− count
  +` stepper variant was tried and reverted the same day (user preferred
  the cards); do not reintroduce it. Clicking the photo band still opens
  the zoom lightbox (chip label hidden in banner variant).
- **Scroll locking is ref-counted** (`useBodyScrollLock`): `ItemQuickView`
  (always locked while mounted), the `ItemImagePreview` lightbox and the
  `CartDrawer` all acquire/release one shared counter. Never go back to an
  overlay writing `document.body.style.overflow` directly — when nested
  overlays (dialog → lightbox / dialog → drawer) each own the value, closing
  the inner one re-enables page scroll behind the outer one.

---

## Critical Patterns

### Order Fulfillment Pipeline
```
Customer pays → Stripe webhook → Verify signature → Update order (PAID) 
→ Check quotation freshness → Place Lalamove order → Store lalamove_order_id 
→ Realtime pushes status to customer
```

### Price Calculation
- Base price + sum(modifier.priceDelta) × quantity
- All arithmetic in cents (integers only)
- Format for display: `formatPrice(1250)` → `"RM 12.50"`

### Webhook Security Pattern
1. Read raw request body (do NOT parse JSON first)
2. Verify cryptographic signature against raw body
3. If invalid → return 400, log warning, exit
4. Parse JSON only after signature verification
5. Check idempotency (has this event been processed?)
6. Process event
7. Return 200 immediately

---

## Lessons Learned

### Lalamove Integration
- **Quotation expiry**: Lalamove quotations expire after 5 minutes
- **Solution**: Re-quote in Stripe webhook if quotation > 4 min old
- **Fallback**: If Lalamove booking fails, flag order for manual dispatch (don't lose the order)

### Real-Time Architecture
- **Customer tracking**: Channel `order-${orderId}`, listens for UPDATE on orders table
- **Admin feed**: Channel `admin-orders`, listens for INSERT and UPDATE on orders table
- **Audio alert**: Admin dashboard plays sound on new order INSERT

### Testing Strategy
- **E2E critical path**: Menu → cart → checkout → mock payment → tracking
- **Webhook testing**: Use Stripe CLI to forward webhooks locally
- **Lalamove sandbox**: Test full flow against sandbox before production

### Release Pipeline / Envied Secrets
- **CI must never seed `.env` from `.env.example`.** Envied keeps the **first**
  value when a key is duplicated (`putIfAbsent` in its parser), so the release
  workflow's old `cp .env.example .env` + append-secrets pattern silently shipped
  the example placeholders (`your-project.supabase.co`,
  `your-google-web-client-id-here`). Merchant v0.1.4 could not sign in: email
  login failed with `Failed host lookup: 'your-project.supabase.co'`, and Google
  Sign-In returned `PlatformException(sign_in_failed, ... 10)` (DEVELOPER_ERROR).
  Fixed in `.github/workflows/android-release.yml` by writing `.env` from
  scratch and failing the build on missing or placeholder values. Any mobile or
  merchant release built before 2026-10-18 has the same defect.

### Money / Order Totals
- **`orders.total_cents` is inclusive of the delivery fee** and net of discount. Every
  writer stores `subtotal_cents + delivery_fee_cents - discount_cents`, and Stripe is
  charged the items plus a *separate* "Delivery Fee" line — so that sum is the amount the
  customer actually paid. Adding `delivery_fee_cents` on top therefore double-counts the
  fee (a RM 12.50 order with a RM 4.00 fee renders as RM 20.50 instead of RM 16.50).
- **Read totals through `lib/orders/money.ts`** — `orderTotalCents` / `orderSubtotalCents` —
  never by summing columns by hand. That wrong sum had been copy-pasted into seven surfaces
  before PR #424 fixed them; the helpers are now the single definition, and
  `orderSubtotalCents(order) + delivery_fee_cents === orderTotalCents(order)` is what keeps a
  receipt's rows reconciling to the amount charged.

---

## Known Risks (from docs/plans.md)

| Risk | Mitigation |
|------|-----------|
| Lalamove API approval delayed | Apply Day 1, build against sandbox, manual booking as fallback |
| Lalamove quotation expires | Re-quote in webhook if > 4 min old |
| No driver available | Monitor EXPIRED/REJECTED webhooks, alert owner for manual booking |
| Client-side price manipulation | All prices re-validated server-side from DB |
| Webhook replay/duplication | Idempotency checks (lalamove_order_id, Stripe event ID) |

---

## Deferred Follow-ups (recorded in the PR #424 review)

Agreed during review as follow-ups rather than merge blockers. Each is inherited
behaviour, not a regression introduced by that PR.

- **`accepted` orders have no forward action.** `PRIMARY_ACTIONS` in
  `lib/orders/transition-ui.ts` has no `accepted` key, and `lib/orders/status.ts:131`
  permits only `accepted: ['cancelled']`. GrabFood writes `status: 'accepted'`
  (`lib/grabfood/mapper.ts:138`), so adding `accepted` to the Preparing tab fixed those
  orders being invisible everywhere — but the kitchen still cannot advance one, and the
  only offered action is Cancel. Fix by adding `accepted → preparing` to the canonical
  status machine (all three parity sources) or recording the dead end as intentional.
- **Cancellation reasons are collected and then discarded.** The cancel modal requires a
  ≥10-char note and `useOrderStatusTransition` sends it, but
  `api/admin/orders/[id]/status/route.ts` validates `z.object({ status })`, which strips
  unknown keys, and nothing writes a note to `order_events`. An operator is therefore
  forced to type a reason that is silently dropped, and there is no audit trail of *why*
  an order was cancelled — the record you would want when a cancellation is disputed.
  Either persist it into the existing `order_events` insert or drop `requireNote` rather
  than imply a record that does not exist.
- **The Upcoming pill counter can exceed the rendered list.** The counter is a single
  unbounded `count` query, while the tab query merges two `.limit(200)` fetches in memory
  (`useOrderTabQuery.ts`), so at volume the pill disagrees with the screen. Fine if the
  200-row cap is intended — worth a comment either way.
- **The "Unpaid" metric counts only ASAP `pending` orders** (`useOrderTabCounts.ts`).
  Documented as deliberate, but the label reads broader than the query.
- **`useTodayAsapOrdersQuery` pins `now` at mount** (`:17`, `[]` deps), so a dashboard left
  open overnight keeps summing against the original day's window instead of rolling over.
  It also refetches up to 500 rows on *every* `orders` realtime event with no debounce,
  which a busy kitchen feed could turn into the heaviest query on the page.
- **`StatusTabs` uses `role="tab"` without `aria-controls`/`tabpanel` linkage.** Disclosed
  as a known minor a11y gap; the missing panel link is the part screen readers care about.

---

## Tech Stack Specifics

### Next.js Patterns
- **Server Components by default**: Menu page is 100% RSC (zero client JS for rendering)
- **Client Components when necessary**: Cart state (Zustand), modifiers, Realtime, Google Maps
- **API Routes**: Webhooks, delivery quotes, checkout
- **Server Actions**: Not heavily used (prefer API routes for this project)

### Supabase Patterns
- **RLS policies**: Anonymous can SELECT menu; authenticated users SELECT own orders; service_role bypasses RLS
- **Realtime subscriptions**: postgres_changes events for live order updates
- **Storage**: Menu item images, receipts

### Stripe Patterns
- **Checkout Sessions**: Redirect flow (simplest PCI compliance)
- **Payment methods**: Card, FPX, GrabPay (MYR)
- **Webhook events**: `checkout.session.completed` triggers order fulfillment

### Lalamove Patterns
- **Auth**: HMAC-SHA256 signature generation
- **Service type**: MOTORCYCLE (fastest and cheapest for KL)
- **Quotation → Order**: Get quote first, then place order with quotationId
- **Webhooks**: Delivery status updates (ASSIGNING → ON_GOING → COMPLETED)

---

## Project Structure Highlights

```
docs/
  architecture.md    # System design, tech stack, patterns
  plans.md          # 14 milestones, risk register, demo script
  documentation.md  # Progress tracking, decisions, troubleshooting

src/
  app/              # Next.js App Router pages
  components/       # React components (layout, menu, cart, order, admin)
  stores/           # Zustand cart store
  hooks/            # Realtime subscriptions
  lib/              # Supabase, Stripe, Lalamove, validators, queries
  types/            # TypeScript types

supabase/
  migrations/       # Database schema
  seed.sql          # Menu data
```

---

## Current Focus

**Milestone Status**: Check docs/documentation.md for current progress

**Next Steps**: Follow docs/plans.md execution plan milestone by milestone

---

## Notes for Future Sessions

- Always read SOUL.md first to understand working style
- Check memory/YYYY-MM-DD.md for recent session context
- Assess impact (callers, affected flows) before modifying payment/delivery code
- Test payment flows locally before committing
- Update this file when significant decisions or learnings occur
- Never add a floor-style Dependabot `ignore` (e.g. `versions: [">=X"]`). A floor suppresses
  every future CVE fix for that package, because Dependabot can never raise the floor. This is
  what left the critical Next.js RCE alerts open — see `.github/dependabot.yml`
- **Never blindly re-run `supabase db push`.** Migration `053_channel_menu_mapping` is
  **already applied** to project `oxtauhhixztusjlxcipo` (recorded as `version=053
  name=channel_menu_mapping`, verified via `information_schema`), but its file was missing
  from master until PR #420. Its SQL is **not idempotent** (`CREATE TABLE` / `ADD COLUMN` /
  `CREATE POLICY`), so a re-push fails — the same trap already hit once with 048–053. A file
  present in the repo does not mean a migration still needs applying.
- **Local `npm run typecheck` / one vitest failure are not code bugs.** `package-lock.json`
  pins stripe 23.0.0 but `node_modules` has 22.6.2, so typecheck reports 13 errors
  (`allowed_payment_method_types`, the `2026-09-30.endive` API version) and
  `lib/stripe/__tests__/api-version.test.ts` fails — all identical on pristine master. Run
  `npm ci`, do not "fix" the code. CI passes because it runs `npm ci`.
- `.next/dev/types/validator.ts` is a stale generated artifact whose errors track *missing
  routes*; a typecheck error count that moves on its own is this file, not your change.
- Store secrets/logs via `sanitizeForLog` (see the 2026-10-14 decision above). Never inline a
  private copy of a sanitiser — that duplication is what caused CodeQL alert #57.

---

**Philosophy**: This file grows over time. Add what's worth remembering. Remove what's no longer relevant. Keep it focused and actionable.
