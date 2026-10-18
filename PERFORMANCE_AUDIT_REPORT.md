# Performance Audit & Bug-Fix Report — noa10/madkrapow

**Branch:** `perf/audit-2026-10-18` (13 commits)
**Base:** `master` @ `10907a5`
**Date:** 2026-10-18
**Scope:** the five reported checkout/app performance bugs, plus defects found by an independent verification pass.

---

## 1. Summary

| # | Bug | Root cause (verified) | Fix | Status |
|---|-----|----------------------|-----|--------|
| 1 | Adding to cart is slow | Cart rows subscribed to the **entire** cart store (`useCartStore()`), so every mutation re-rendered every row; the menu catalog re-rendered on **every scroll event** (`setActiveId` in an IntersectionObserver); `RichMenuCard` was unmemoized; per-card `backdrop-blur` + 60 px shadows cost paint on every frame | Granular zustand selectors + `memo` in `CartItem`; `activeId` updates are no-ops when unchanged and the grid no longer re-renders with them; memoized card tree; lighter paint; instant local "Added ✓" feedback (zero network on add) | Fixed |
| 2 | **Checkout hangs on Delivery → Pickup → Delivery** (payment blocked) | `lastQuotedCoords` **ref survived** `setDeliveryType()`, which clears the stored quote. On the way back to Delivery the effect saw "same coords" and `return`ed before re-quoting, while `isDeliveryFeeLoading` was derived from *missing store data* → permanent "Calculating delivery fee…". Secondary: a second quote writer inside `DeliveryAddressInput` raced the page, geocoding triggered duplicate fetches, and quote failures never surfaced | Pure decision module (`decideQuoteNeed`) with an explicit **`quote-cleared`** case; single-flight `AbortController` + request tokens; explicit `quoteStatus` state machine (loading/ready/error); page is the sole quote owner; address-key tracking cancels stale geocodes; reactive quote expiry; retryable error UI; **15 s request timeout** so a stalled upstream cannot hang checkout | **Fixed** |
| 3 | Back navigation slow / wrong target | Middleware ran `supabase.auth.getUser()` — a **network round-trip** — on *every* request, including public pages; `BackButton` used `window.history.length > 1` (counts other sites), and add-to-cart silently called `router.back()` | `getUser()` only for `/admin`, `/orders`, `/checkout`, `/profile`, `/auth`; root-level `InAppHistoryTracker` (sessionStorage, per-tab) + `shouldGoBack`; add-to-cart no longer navigates; removed a dead duplicate item-detail component | Fixed |
| 4 | Admin pages slow | Dashboard pulled **every column of every order today** (`select("*")`) just to sum one field; today-ASAP pulled 500 full rows and refetched on **every** realtime event; tab queries used `*, order_items(quantity)`; 4 `count: exact` queries per invalidation; two `getUser()` calls per admin load behind a **full-page spinner**; recharts (414 KiB) in every analytics load; missing composite indexes | Explicit column projections (`ADMIN_ORDER_LIST_SELECT`), coalesced 500 ms realtime invalidations (hidden-tab aware), 5-min shared role cache with auth subscription, dynamic `next/dynamic` chart bundles, migration `054` with 4 composite indexes | Fixed (residual `select("*")` outside scope — see §6) |
| 5 | Global load / data fetching slow | Home page **blocked on a full menu DB fetch whose result was discarded**; the root-layout `CartDrawer` fetched the whole menu (4 queries) on **every page**; `getMenuItems` ran 4 sequential queries per caller; the menu list fired **one promo-preview request per item** (3+ DB queries each); branding mounted 2 fetches + 2 realtime channels per page; auth `getUser()` per page mount | Removed the dead home fetch; lazy drawer fetch; `menu-client` cache (5 min TTL, in-flight dedupe, explicit columns, parallel queries); batched `/api/promos/preview` (`itemIds[]`) used by a single menu request; branding singleton (1 channel, TTL, errors not cached); shared client-user cache wired into the live sidebars; image formats + `staleTimes` in `next.config.ts` | Fixed |

### Additional defects found by the independent review (also fixed)

1. **Second quote writer.** `DeliveryAddressInput` posted `/api/delivery/quote` and wrote `setShippingQuote` itself → duplicate quotes and late responses could overwrite newer state. The checkout page is now the only quote owner.
2. **Stale geocode overwrite.** Two different addresses both have `quoteKey === null` while geocoding, so a changed address looked "in flight". Added `quoteAddressKey` + `activeAddressKey` so a new address aborts/refetches instead of being skipped (and name/phone edits made during geocoding are no longer overwritten).
3. **Nav tracker never counted.** The tracker lived inside `BackButton`, which only mounts on the item page — menu → item happened before it existed, so the counter stayed 0 and the button always fell back. Moved to a root-layout tracker.
4. **Auth cache was dead code.** It was wired into `Header`, which is not mounted anywhere; the live sidebars still called `getUser()` on every mount. Wired into `ClientSidebar`/`DashboardSidebar`, added an auth epoch + `INITIAL_SESSION` guard so a slow response cannot overwrite a newer sign-in/out.
5. **Admin layout auth lifecycle.** Could return early with `isChecking` still true and never subscribed to auth changes.
6. **Branding channel leak + error caching.** Shared channel is now removed after the last subscriber; transient DB errors are no longer cached for 5 minutes; realtime events during an in-flight fetch trigger one follow-up fetch.

---

## 2. Verification (final tree)

| Gate | Result |
|---|---|
| `npm run typecheck` | **exit 0**, no diagnostics |
| `npm test` | **58 test files passed**, 1 skipped; **750 tests passed**, 3 skipped. The only failing file is `apps/web/src/app/api/bots/whatsapp/__tests__/webhook.test.ts` — **untouched by this branch and failing identically on pristine `master`** (same 5 test names, 5 failed / 30–36 passed in isolation on both trees). It is flaky under this 2-vCPU sandbox (worker `SIGABRT`/heap); an earlier full run on this branch passed it: 722 passed / 0 failed |
| `npm run lint` | **0 errors**, 33 warnings (baseline: 35 warnings) |
| `npm run build` (Next 16.4.1, placeholders only) | **exit 0**, 152 client chunks / 2,841 KiB |
| New unit tests | **31**: quote decision state machine (19), back-navigation helper (10), admin order projection (2) |
| Structural checks (32 assertions, one per acceptance criterion) | **32/32 pass** |

### Bundle evidence (bug 5 / bug 4)

| | Baseline (`master`) | This branch |
|---|---|---|
| `/admin/analytics` initial client chunks | includes **one 414 KiB recharts chunk** (`4583-…js`) | recharts split into 3 async chunks (**413 KiB**), **0** referenced by the route's client-reference manifest; registered as two `next/dynamic` imports |
| `/admin/analytics` route chunk | 11 KiB | 11 KiB (recharts no longer eager) |
| Total client JS | 2,826 KiB | 2,841 KiB (+0.5 %, from new code; the 414 KiB analytics payload moved off the critical path) |

> Measured from `.next` build artefacts: `static/chunks` totals plus each route's `page_client-reference-manifest.js` chunk references.

---

## 3. What changed, by area

**Checkout (critical path)**
- `apps/web/src/lib/checkout/delivery-quote.ts` (new, pure): `quoteKey`, `quoteAddressKey`, `decideQuoteNeed` with skip/fetch reasons (`pickup`, `no-address`, `in-flight`, `quote-fresh`, `quote-cleared`, `quote-expired`, `coords-changed`, `address-changed`), `DELIVERY_QUOTE_TIMEOUT_MS`.
- `apps/web/src/app/checkout/page.tsx`: single-flight quote lifecycle (token + `AbortController` + 15 s timeout), explicit `quoteStatus`, reactive expiry (30 s poll + focus/visibility), page-owned quoting, error + Retry copy, Pay gating on real state only.
- `apps/web/src/components/checkout/DeliveryAddressInput.tsx`: no longer quotes; publishes address only (removes the duplicate writer).
- `apps/web/src/stores/checkout.ts`: unchanged public shape (verified).

**Cart / menu**
- `components/cart/CartItem.tsx`: granular selectors + `memo`.
- `components/menu/{MenuCatalogView,RichMenuGrid,RichMenuCard,MenuSection,MenuItemCard}.tsx`: memoized grid/cards, no-op `activeId` updates, lighter paint, instant "Added" acknowledgement.
- `stores/cart.ts`: hoisted modifier-key computation; `removeItem` resolves the index once (semantics unchanged).

**Navigation**
- `apps/web/middleware.ts`: auth work only where the user is needed; redirect semantics unchanged.
- `lib/navigation/back.ts` (new) + `components/layout/InAppHistoryTracker.tsx` (new, root) + `BackButton.tsx`.
- `components/menu/ItemDetailClient.tsx`: add-to-cart stays on the page; `MenuItemDetail.tsx` (dead duplicate) deleted.

**Admin**
- `app/admin/page.tsx`: `select("total_cents")` instead of `*`.
- `app/admin/orders/hooks/*`: explicit projections, coalesced realtime invalidation (500 ms, hidden-tab aware), today-ASAP minimal payload.
- `lib/admin/order-select.ts` (new) + `lib/admin/role-cache.ts` (new, 5 min TTL, auth subscription) used by `admin/layout.tsx` and `use-role-guard.ts`.
- `components/admin/analytics/*` (new) loaded via `next/dynamic`; skeletons.
- `app/api/admin/orders/route.ts`: narrowed projection, same response shape.
- `supabase/migrations/054_orders_perf_indexes.sql` (new): additive composite indexes for `(fulfillment_type, created_at)`, `(fulfillment_type, status, created_at)`, `(status, created_at)`, `(order_kind, created_at)`.

**Global**
- `app/page.tsx`: no menu fetch; `components/home/PageSwitcher.tsx` drops the unused prop.
- `components/cart/CartDrawer.tsx`: fetches menu data only when the drawer opens.
- `lib/queries/menu-client.ts`: 5-min cache, in-flight dedupe, explicit columns, parallel first wave, `invalidateMenuItemsCache()`.
- `app/api/promos/preview/route.ts`: batched `itemIds[]` support (single-item form unchanged); `components/menu/MenuListView.tsx` makes one request.
- `hooks/use-realtime-branding.ts`: singleton store/channel.
- `lib/auth/client-user.ts` (new) + `ClientSidebar`/`DashboardSidebar`.
- `next.config.ts`: `images.formats` (AVIF/WebP), `images.minimumCacheTTL`, `experimental.staleTimes` (`dynamic: 30`, `static: 180`).

---

## 4. Deployment notes

1. **Apply the migration** before measuring admin performance:
   ```
   supabase db push        # or your migration runner
   ```
   `054` is additive only (`CREATE INDEX IF NOT EXISTS`, no data change). It uses plain `CREATE INDEX`, so writes on `orders` are briefly locked during creation — run in a low-traffic window or convert to `CONCURRENTLY` out-of-band.
2. No new dependencies; no environment-variable changes.
3. `staleTimes.dynamic = 30` means back/forward can serve a client Router Cache entry up to 30 s old (server data is still authoritative on hard loads/mutations). Tune to `0` if strict freshness is required.
4. Client caches to be aware of: menu/modifiers 5 min (`invalidateMenuItemsCache()` exported), branding 5 min, admin role 5 min (server/RLS still enforce on every request).

## 5. Manual smoke test (recommended on staging)

1. `/checkout` with a delivery address → switch **Delivery → Pickup → Delivery** several times: the fee must reappear each time and **Pay** must re-enable; no "Calculating…" stuck state.
2. Kill/blackhole the Lalamove call: after 15 s the card must show "Delivery quote timed out. Please retry."
3. Add items from the menu and from an item page: instant drawer/toast, no navigation away from the item page.
4. Item page → **Back to Menu**; also hard-refresh an item URL in a new tab → Back must go to `/menu`, never leave the app.
5. `/admin` → `/admin/orders` → `/admin/analytics`: no full-page spinner after the first load; analytics charts load lazily; confirm `EXPLAIN` uses the new indexes on a production-like dataset.

## 6. Known residuals / follow-ups (not changed here)

- `select("*")` remains in admin surfaces outside this scope: `hooks/useAdminOrders.ts`, `hooks/use-promos.ts`, `components/admin/MenuItemForm.tsx`, `api/admin/employees/route.ts`, `api/admin/sales-reports/route.ts`.
- `useRealtimeOrderUpdates` DELETE does not invalidate tab counts; today-ASAP DELETE events cannot refresh from the payload (PK-only `old` record).
- `withOrderItemCount` casts a partial row to `Order` — fine today, a type-safety hole for future consumers.
- The WhatsApp webhook test suite is flaky in memory-constrained environments (pre-existing; untouched).
- `supabase.auth.getSession()` inside the quote flow can still refresh a token over the network on expiry (bounded by the 15 s quote timeout only for the quote itself).
