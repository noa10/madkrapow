# plans.md — Mad Krapow D2C: Execution Plan, Risk Register & Demo Script

This document is the complete execution plan, risk register, demo script, and decision log.We implement milestone by milestone, validating each step with lint, typecheck, tests, and manual verification.

## Guiding Principles

1. **Security over convenience:** all prices validated server-side, all webhooks signature-verified, RLS everywhere.
2. **Mobile-first over responsive:** design for 375px thumb-reach zones first, desktop is a bonus.
3. **Correctness over speed:** a wrong order costs more than a slow deploy.
4. **Lean over complete:** build only what Mad Krapow needs for V1 launch.
5. **Observable over opaque:** every order state change is logged, timestamped, and surfaced.

## Milestone Plan

Each milestone includes: scope, key files/modules, acceptance criteria, and commands to verify.

### Milestone 0 — Project Bootstrap & Infrastructure

**Scope:**

- Initialize Next.js 14+ project with App Router, TypeScript (strict), Tailwind CSS, shadcn/ui.
- Configure ESLint, Prettier, Husky pre-commit hooks.
- Create Supabase project; configure Auth providers (Google OAuth, magic link email).
- Create Stripe account; configure for MYR, enable FPX and GrabPay payment methods.
- Apply for Lalamove API access (Partner Portal); obtain sandbox credentials.
- Link GitHub repo to Vercel; configure environment variables and preview deploys.
- Set up path aliases (@/ → src/) and base folder structure.

**Key Files:**

```
next.config.ts
tailwind.config.ts
tsconfig.json
.env.local.example
src/lib/supabase/server.ts
src/lib/supabase/client.ts
src/lib/supabase/middleware.ts
src/middleware.ts
```

**Acceptance Criteria:**

- `npm run dev` starts the app on localhost:3000 with a placeholder page.
- `npm run lint` and `npm run typecheck` pass with zero errors.
- Supabase project accessible; auth providers configured.
- Vercel preview deploy succeeds on PR creation.
- `.env.local.example` documents all required environment variables.

**Verification:**

```bash
npm run dev          # App loads at localhost:3000
npm run lint         # Zero errors
npm run typecheck    # Zero errors
npm run build        # Production build succeeds
```

### Milestone 1 — Database Schema & Seed Data

**Scope:**

- Execute full Supabase migration: all tables, RLS policies, indexes.
- Create seed script with Mad Krapow menu data (categories, items, modifier groups, modifiers).
- Validate RLS: public can read menu, authenticated users can read own orders, admin role can write.

**Key Files:**

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_indexes.sql
supabase/seed.sql
scripts/seed.ts
```

**Acceptance Criteria:**

- All 12 tables created with correct constraints and relationships.
- RLS policies enforced: anonymous SELECT on menu tables; authenticated user SELECT on own orders; service_role bypasses RLS for webhooks.
- Seed data includes: ≥5 categories, ≥20 menu items, ≥6 modifier groups, ≥25 modifiers.
- `supabase db reset` runs cleanly and seeds data.

**Verification:**

```bash
npx supabase db reset        # Schema + seed applied
npx supabase test db         # RLS policy tests pass (if using pgTAP)
# Manual: query tables in Supabase dashboard, verify row counts
```

**Tables (summary):**

| Table | Purpose |
| --- | --- |
| store_settings | Single-row store config (address, hours, Lalamove market) |
| categories | Menu category groups |
| menu_items | Individual dishes with price (cents), image, availability |
| modifier_groups | "Spice Level", "Protein", "Add-ons" etc. |
| modifiers | Individual options with price_delta |
| menu_item_modifier_groups | Many-to-many join |
| customers | Extends auth.users with profile data |
| customer_addresses | Saved delivery addresses with lat/lng |
| orders | Master order record with status, pricing, Stripe + Lalamove IDs |
| order_items | Line items with denormalized names/prices |
| order_item_modifiers | Selected modifiers per line item |
| promo_codes | Discount codes (future-ready) |

### Milestone 2 — Menu Display (Customer-Facing)

**Scope:**

- Build the main menu page: hero banner + sticky category nav + scrollable menu grid.
- Fetch menu data via Server Components (RSC) using Supabase server client.
- Build MenuItemCard: image, name, description snippet, price, "Add" button.
- Implement intersection observer for active category highlighting during scroll.
- Implement store open/closed check based on operating_hours.
- Mobile-first responsive layout.

**Key Files:**

```
src/app/page.tsx
src/app/layout.tsx
src/components/layout/Header.tsx
src/components/layout/MobileNav.tsx
src/components/menu/CategoryNav.tsx
src/components/menu/CategorySection.tsx
src/components/menu/MenuItemCard.tsx
src/components/menu/StoreClosedBanner.tsx
src/lib/queries/menu.ts
```

**Acceptance Criteria:**

- Menu page loads in < 2s (LCP) on mobile 4G throttle.
- Categories are horizontally scrollable and tap-navigable.
- Active category highlights on scroll via IntersectionObserver.
- "Currently Closed" banner renders outside operating hours with ordering disabled.
- Items without images show a tasteful placeholder.
- All data server-rendered (SEO-friendly, no client-side fetch flash).

**Verification:**

```bash
npm run dev                  # Visit localhost:3000, see full menu
npm run build && npm start   # Verify SSR output in production mode
# Lighthouse: LCP < 2.5s, Accessibility > 90
```

### Milestone 3 — Item Detail & Modifier Selection

**Scope:**

- Build item detail view (modal on mobile, slide-over or page on desktop).
- Fetch item + modifier groups + modifiers.
- Build ModifierGroup component: radio (single selection) or checkbox (multi selection).
- Required modifier groups must be selected before add-to-cart is enabled.
- Real-time price update as modifiers are selected (base + sum of price_deltas).
- Special instructions text input.
- Quantity selector.

**Key Files:**

```
src/app/item/[id]/page.tsx
src/components/menu/MenuItemDetail.tsx
src/components/menu/ModifierGroup.tsx
src/components/menu/ModifierOption.tsx
src/components/menu/QuantitySelector.tsx
src/components/menu/SpecialInstructions.tsx
```

**Acceptance Criteria:**

- Item detail shows: image (large), name, description, base price, all modifier groups.
- Single-selection groups render as radio buttons; multi-selection as checkboxes.
- Required groups show "(Required)" label; "Add to Cart" disabled until all required groups satisfied.
- Price display updates live: `RM XX.XX` format reflecting base + selected modifier deltas × quantity.
- "Add to Cart" button adds item with all selections to Zustand cart store.

**Verification:**

```bash
npm run dev   # Navigate to any item, select modifiers, verify price updates
npm run test  # Unit tests: price calculation, required validation, modifier selection logic
```

### Milestone 4 — Cart State & Cart UI

**Scope:**

- Build Zustand cart store: add, remove, update quantity, clear.
- Cart store persisted to localStorage (survives refresh).
- Build CartDrawer (slide-out from right on mobile).
- Build Cart page (/cart) with full item list, modifier summary, quantity controls.
- Build CartSummary: subtotal calculation (before delivery).
- Minimum order amount enforcement from store_settings.

**Key Files:**

```
src/stores/cart.ts
src/app/cart/page.tsx
src/components/cart/CartDrawer.tsx
src/components/cart/CartItem.tsx
src/components/cart/CartSummary.tsx
src/components/layout/CartBadge.tsx
```

**Acceptance Criteria:**

- Cart icon in header shows badge with item count.
- CartDrawer opens on tap; shows items with modifiers summarized.
- Quantity +/- buttons; swipe-to-remove or delete button.
- Subtotal calculated correctly (all items × quantities + modifier deltas).
- Cart persists across page navigation and browser refresh.
- "Minimum order RM XX" message shown if subtotal <store_settings.min_order_amount.
- "Checkout" button disabled if below minimum or cart empty.

**Verification:**

```bash
npm run dev   # Add items, modify quantities, refresh page — cart persists
npm run test  # Cart store unit tests: add/remove/update/clear/persistence
```

### Milestone 5 — Delivery Address & Lalamove Quote

**Scope:**

- Build DeliveryAddressInput with Google Places Autocomplete.
- Geocode selected address to lat/lng.
- Build API route `/api/delivery/quote` → calls Lalamove `/v3/quotations`.
- Display delivery fee breakdown (base + surcharge + total).
- Handle quote expiry (5 min) — re-quote if stale.
- Build saved address selector for authenticated users.

**Key Files:**

```
src/components/cart/DeliveryAddressInput.tsx
src/components/cart/DeliveryFeeDisplay.tsx
src/components/cart/SavedAddressSelector.tsx
src/app/api/delivery/quote/route.ts
src/lib/lalamove/client.ts
src/lib/lalamove/auth.ts       # HMAC-SHA256 signature generation
src/lib/google-maps/places.ts
```

**Lalamove Auth Implementation:**

```typescript
// HMAC-SHA256 signature for Lalamove API v3
import crypto from 'crypto';

export function generateLalamoveSignature(
  apiSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string
): string {
  const rawSignature = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  return crypto
    .createHmac('sha256', apiSecret)
    .update(rawSignature)
    .digest('hex');
}
```

**Acceptance Criteria:**

- Google Places autocomplete suggests Malaysian addresses as user types.
- On address selection, lat/lng is geocoded and Lalamove quote fetched.
- Delivery fee displayed with breakdown: base fare, surcharge, total.
- Loading spinner during quote fetch; error message if quote fails.
- Quote stored in state with quotationId and expiry timestamp.
- Re-quote triggered automatically if quotation is older than 4 minutes.
- Authenticated users see saved addresses as quick-select chips.

**Verification:**

```bash
npm run dev   # Enter address, see delivery fee appear
# Test with Lalamove sandbox credentials
curl -X POST localhost:3000/api/delivery/quote \
  -H "Content-Type: application/json" \
  -d '{"dropoff":{"latitude":3.1234,"longitude":101.6234,"address":"Test"}}'
```

### Milestone 6 — Stripe Checkout & Payment

**Scope:**

- Build `/api/checkout` route: validate cart server-side, create Supabase order, create Stripe Checkout session.
- Server-side price validation: re-fetch all item prices from DB, recalculate total, reject if mismatch.
- Support payment methods: card, FPX, GrabPay.
- Build checkout page with order summary.
- Build checkout success page (redirect from Stripe).

**Key Files:**

```
src/app/api/checkout/route.ts
src/app/checkout/page.tsx
src/app/checkout/success/page.tsx
src/components/checkout/OrderReview.tsx
src/components/checkout/PromoCodeInput.tsx
src/components/checkout/PaymentButton.tsx
src/lib/stripe/client.ts
src/lib/validators/checkout.ts   # Zod schema for cart validation
```

**Acceptance Criteria:**

- Server-side recalculates all prices from DB — never trusts client-sent prices.
- Order created in Supabase with status `PENDING` before redirect.
- Stripe Checkout Session created with correct line items, delivery fee, metadata (order_id, quotation_id).
- Customer redirected to Stripe hosted checkout page.
- On success, redirected to `/checkout/success?order_id=XXX`.
- Success page shows order number, estimated time, and "Track Order" button.
- On cancel/back, customer returns to `/cart` with cart intact.

**Verification:**

```bash
npm run dev   # Complete full flow: menu → cart → checkout → Stripe test payment
# Use Stripe test card: 4242 4242 4242 4242
# Verify order created in Supabase with status PENDING
npm run test  # Price validation unit tests, checkout schema tests
```

### Milestone 7 — Stripe Webhook & Lalamove Auto-Booking

**Scope:**

- Build `/api/webhooks/stripe` — handle `checkout.session.completed` event.
- Verify Stripe webhook signature.
- Update order status to `PAID`, set `paid_at` timestamp.
- Automatically call Lalamove POST `/v3/orders` to book delivery driver.
- Store `lalamove_order_id` and `lalamove_share_link` in order record.
- Handle edge cases: quotation expired (re-quote and book), Lalamove API error (flag for manual dispatch).

**Key Files:**

```
src/app/api/webhooks/stripe/route.ts
src/lib/lalamove/book.ts
src/lib/services/order-fulfillment.ts
```

**Critical Flow:**

```
Stripe webhook fires (checkout.session.completed)
  → Verify signature (reject if invalid)
  → Extract order_id from metadata
  → Update order: status=PAID, paid_at=now()
  → Fetch stored quotation_id
  → If quotation age > 4min: create new quotation
  → Call Lalamove POST /v3/orders
  → Update order: lalamove_order_id, lalamove_share_link
  → If Lalamove fails: set delivery_status=MANUAL_REQUIRED, alert owner
  → Return 200 to Stripe
```

**Acceptance Criteria:**

- Stripe webhook signature verification rejects invalid payloads (return 400).
- Order status transitions: PENDING → PAID.
- Lalamove order placed within seconds of payment confirmation.
- `lalamove_order_id` and share link stored in DB.
- If Lalamove booking fails, order is flagged (not lost) and owner alerted.
- Idempotent: duplicate webhook delivery does not create duplicate Lalamove orders.

**Verification:**

```bash
# Use Stripe CLI to forward webhooks locally:
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Complete a test payment, verify:
# 1. Order status = PAID in Supabase
# 2. Lalamove order created in sandbox
# 3. lalamove_order_id populated
npm run test  # Webhook signature verification tests, idempotency tests
```

### Milestone 8 — Order Tracking (Real-Time)

**Scope:**

- Build Lalamove webhook handler `/api/webhooks/lalamove` for delivery status updates.
- Build order tracking page `/order/[id]` with real-time status via Supabase Realtime.
- Build OrderStatusTracker: visual step indicator (Confirmed → Preparing → Ready → Picked Up → Delivered).
- Build DriverInfo component: driver name, phone, plate number, Lalamove tracking link.
- Push status updates to customer's browser in real-time.

**Key Files:**

```
src/app/api/webhooks/lalamove/route.ts
src/app/order/[id]/page.tsx
src/components/order/OrderStatusTracker.tsx
src/components/order/OrderDetails.tsx
src/components/order/DriverInfo.tsx
src/hooks/useOrderTracking.ts      # Supabase Realtime subscription
```

**Supabase Realtime Pattern:**

```typescript
// useOrderTracking.ts
const channel = supabase
  .channel(`order-${orderId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: `id=eq.${orderId}`,
  }, (payload) => {
    setOrder(payload.new);
  })
  .subscribe();
```

**Acceptance Criteria:**

- Lalamove webhook updates delivery_status + driver info in DB.
- Customer sees status update within 2 seconds of DB change (no refresh needed).
- Step indicator shows correct active step for each status.
- Driver info section appears when driver is assigned (name, phone call link, plate number).
- "Track on Map" button opens Lalamove share link in new tab.
- Page works for both authenticated and guest users (via order_id in URL).

**Verification:**

```bash
npm run dev   # Open order tracking page
# Simulate Lalamove webhook with different statuses:
curl -X POST localhost:3000/api/webhooks/lalamove \
  -H "Content-Type: application/json" \
  -d '{"orderId":"...","status":"ON_GOING","driverName":"Ahmad"}'
# Verify: page updates in real-time without refresh
```

### Milestone 9 — Authentication & Customer Features

**Scope:**

- Implement Supabase Auth: Google OAuth + magic link email.
- Auth middleware: protect /orders, /admin/* routes.
- Build auth pages (login, callback).
- Build customer profile: saved addresses, order history.
- Build re-order functionality (pre-fill cart from previous order).

**Key Files:**

```
src/app/auth/page.tsx
src/app/auth/callback/route.ts
src/app/orders/page.tsx
src/components/auth/AuthForm.tsx
src/components/auth/AuthGuard.tsx
src/components/order/OrderCard.tsx
src/components/order/ReorderButton.tsx
src/middleware.ts               # Route protection
```

**Acceptance Criteria:**

- Google OAuth and magic link both work end-to-end.
- Unauthenticated users can still complete guest checkout (name + phone + email collected).
- Authenticated user's orders linked to their profile.
- Order history page shows all past orders, sorted newest-first.
- "Re-order" button populates cart with items + modifiers from past order.
- Saved addresses appear in delivery input for returning customers.

**Verification:**

```bash
npm run dev   # Test Google login, magic link login
# Place order while authenticated → appears in /orders
# Click re-order → cart populated
npm run test  # Auth middleware tests, re-order cart population tests
```

### Milestone 10 — Admin Dashboard: Order Management

**Scope:**

- Build admin layout with sidebar navigation and role-based access guard.
- Build real-time order feed using Supabase Realtime subscriptions.
- Build order ticket view with status transition buttons.
- Implement audio notification on new incoming order.
- Build order detail view with full item/modifier breakdown.

**Key Files:**

```
src/app/admin/layout.tsx
src/app/admin/page.tsx
src/app/admin/orders/page.tsx
src/app/admin/orders/[id]/page.tsx
src/components/admin/OrderFeed.tsx
src/components/admin/OrderTicket.tsx
src/components/admin/StatusTransitionButtons.tsx
src/components/admin/NewOrderAlert.tsx
src/lib/admin/auth-guard.ts
```

**Status Transition Rules:**

```
PAID → ACCEPTED (kitchen acknowledges)
ACCEPTED → PREPARING (cooking started)
PREPARING → READY (food ready for pickup)
READY → PICKED_UP (driver has food) ← usually via Lalamove webhook
PICKED_UP → DELIVERED ← via Lalamove webhook
Any → CANCELLED (with reason)
```

**Acceptance Criteria:**

- Only users with admin role can access /admin/* pages (redirect others to /).
- New orders appear in feed instantly via Supabase Realtime.
- Audio "ding" plays when new order arrives.
- Status buttons only show valid next states.
- Order ticket shows: items, modifiers, special instructions, delivery address, customer phone.
- Clicking customer phone opens tel: link.

**Verification:**

```bash
npm run dev   # Open admin dashboard in one tab
# Place an order in another tab → order appears instantly in admin
# Click through status transitions: PAID → ACCEPTED → PREPARING → READY
```

### Milestone 11 — Admin Dashboard: Menu Management

**Scope:**

- Build menu CRUD interface: categories, items, modifier groups, modifiers.
- Image upload to Supabase Storage for menu item photos.
- Toggle item availability (sold out / back in stock).
- Drag-to-reorder categories and items (sort_order update).

**Key Files:**

```
src/app/admin/menu/page.tsx
src/app/admin/menu/[id]/page.tsx
src/app/admin/menu/new/page.tsx
src/components/admin/MenuEditor.tsx
src/components/admin/ModifierEditor.tsx
src/components/admin/ImageUpload.tsx
src/components/admin/SortableList.tsx
src/app/api/admin/menu/route.ts
src/app/api/admin/menu/[id]/route.ts
src/app/api/admin/upload/route.ts
```

**Acceptance Criteria:**

- Full CRUD for categories, items, modifier groups, modifiers.
- Image upload: accept jpg/png/webp, resize to max 800px, upload to Supabase Storage.
- Availability toggle: instant update, reflected on customer menu within seconds.
- Sort order: drag-and-drop persisted to DB.
- Form validation: name required, price ≥ 0, at least one category.

**Verification:**

```bash
npm run dev   # Admin → Menu → Create new item → Upload image → Save
# Verify item appears on customer-facing menu
# Toggle availability → verify "Sold Out" badge appears on menu
```

### Milestone 12 — Admin: Store Settings & Analytics

**Scope:**

- Build store settings page: operating hours, minimum order amount, contact info.
- Build basic analytics dashboard: daily/weekly/monthly revenue, order count, average order value, top items.
- Revenue chart (bar chart with recharts or Chart.js).

**Key Files:**

```
src/app/admin/settings/page.tsx
src/app/admin/analytics/page.tsx
src/components/admin/StoreSettingsForm.tsx
src/components/admin/OperatingHoursEditor.tsx
src/components/admin/StatsCard.tsx
src/components/admin/RevenueChart.tsx
src/components/admin/TopItemsTable.tsx
src/app/api/admin/analytics/route.ts
```

**Acceptance Criteria:**

- Operating hours saved as JSONB; menu page respects them.
- Stats cards show: today's revenue, today's orders, average order value, pending orders.
- Revenue chart shows daily totals for last 30 days.
- Top items table shows top 10 items by order count.
- All analytics queries use server-side Supabase with service_role key (no RLS bypass needed on client).

**Verification:**

```bash
npm run dev   # Admin → Analytics → verify data matches orders in DB
# Admin → Settings → change operating hours → verify menu shows "Closed" outside hours
```

### Milestone 13 — Email Notifications & SEO

**Scope:**

- Send order confirmation email via Resend when payment succeeds.
- Send receipt email with itemized breakdown when order delivered.
- SEO: metadata, Open Graph images, JSON-LD structured data (Restaurant schema).
- Sitemap.xml and robots.txt.

**Key Files:**

```
src/lib/email/send-confirmation.ts
src/lib/email/send-receipt.ts
src/lib/email/templates/order-confirmation.tsx  # React Email
src/lib/email/templates/receipt.tsx
src/app/layout.tsx              # metadata, JSON-LD
src/app/sitemap.ts
src/app/robots.ts
```

**Acceptance Criteria:**

- Order confirmation email sent within 10 seconds of payment.
- Receipt email sent when order status reaches DELIVERED.
- Emails render correctly in Gmail, Apple Mail, Outlook (test with Resend preview).
- JSON-LD Restaurant schema on menu page validates via Google Rich Results Test.
- OG image shows Mad Krapow branding for social sharing.

**Verification:**

```bash
npm run dev   # Complete order → check email delivery in Resend dashboard
# Google Rich Results Test: paste menu page URL
# Facebook Sharing Debugger: verify OG tags
```

### Milestone 14 — Testing, Polish & Production Launch

**Scope:**

- Playwright E2E tests: full ordering flow (menu → cart → checkout → mock payment → tracking).
- Error handling: sold out items, store closed, payment failure, Lalamove unavailable.
- Performance: next/image optimization, lazy loading, skeleton loaders.
- PWA: manifest.json, service worker, add-to-homescreen prompt.
- Lalamove sandbox → production credentials cutover.
- Stripe test → live mode cutover.
- Custom domain configuration.
- Sentry error monitoring setup.
- Vercel Analytics enabled.

**Key Files:**

```
e2e/ordering-flow.spec.ts
e2e/admin-orders.spec.ts
e2e/fixtures/test-data.ts
next.config.ts                  # Image optimization, headers
public/manifest.json
src/app/manifest.ts
sentry.client.config.ts
sentry.server.config.ts
```

**Acceptance Criteria:**

- E2E test passes: browse menu → add item with modifiers → enter address → proceed to checkout → verify order created.
- All error states have user-friendly messages (not raw errors).
- Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1.
- PWA installable on mobile (add to home screen).
- Production deploy succeeds on Vercel with all environment variables.
- Custom domain (order.madkrapow.com) resolves correctly with HTTPS.
- Sentry captures and reports errors.

**Verification:**

```bash
npx playwright test              # All E2E tests pass
npm run build                    # Production build, zero warnings
npm run lint && npm run typecheck # Clean
# Lighthouse audit on production URL: Performance > 90, A11y > 90
# Verify Sentry: trigger a test error, confirm it appears in dashboard
```

## Risk Register

| # | Risk | Impact | Prob. | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Lalamove API approval delayed | High — cannot launch delivery | Medium | Apply Day 1. Build full flow against sandbox. Manual Lalamove booking as launch-day fallback. |
| R2 | Lalamove quotation expires (5 min window) | Medium — order placement fails | Medium | Re-quote in Stripe webhook if quotation > 4 min old. Cache displayed fee; absorb any difference (typically minimal). |
| R3 | Lalamove no driver available (order expires) | High — food ready, no pickup | Low | Monitor EXPIRED/REJECTED webhooks. Alert owner immediately. Owner manually books via Lalamove app as backup. |
| R4 | Stripe FPX not approved for account | Medium — limits MY payment methods | Low | Apply early; cards + GrabPay work Day 1. FPX added when approved. |
| R5 | Google Maps API quota exceeded | Low — autocomplete stops working | Low | Set daily quota limits. Cache recent geocodes. Fallback: manual address entry with coordinates. |
| R6 | Supabase Realtime connection drops | Medium — admin misses orders | Low | Implement reconnection logic. Polling fallback every 30s. Audio alert ensures attention even if delayed. |
| R7 | Client-side price manipulation | High — financial loss | Medium | All prices re-validated server-side from DB before Stripe session creation. Never trust client-sent totals. |
| R8 | Webhook replay / duplication | Medium — duplicate Lalamove bookings | Medium | Idempotency: check if order already has lalamove_order_id before booking. Use Stripe event ID deduplication. |

## Demo Script (3-Minute Walkthrough for Stakeholders)

### Setup

- Open the app on a mobile phone (or Chrome DevTools mobile view).
- Have the admin dashboard open in a separate browser tab on desktop.

### Flow (3 minutes)

**[0:00 – 0:30] First Impression**

- Open order.madkrapow.com on phone.
- Hero banner with Mad Krapow branding loads instantly.
- Scroll through the menu — categories stick to the top, items display beautifully.
- Point out: "This is YOUR website, not Grab. Zero commission."

**[0:30 – 1:00] Ordering Experience**

- Tap "Pad Krapow Chicken" — item detail slides up.
- Select spice level: "Extra Spicy". Select add-on: "Fried Egg +RM2".
- Watch the price update in real-time.
- Tap "Add to Cart" — cart badge updates.
- Add one more item quickly.

**[1:00 – 1:30] Delivery & Checkout**

- Open cart. Enter delivery address — Google autocomplete.
- Delivery fee from Lalamove appears: "RM8.00 (5.2km)".
- Tap "Checkout" → Order summary → Tap "Pay RM38.50".
- Stripe checkout: enter test card → Payment succeeds.
- Redirect to confirmation page: "Order #47 confirmed! 🎉"

**[1:30 – 2:00] Real-Time Tracking**

- Tap "Track Order" — order status page opens.
- Switch to admin dashboard tab — new order just appeared with audio ding!
- Admin taps "Accept" → "Preparing" → status updates live on customer's phone.
- Point out: "This happened in real-time. No refresh needed."

**[2:00 – 2:30] Admin Power**

- Show admin order feed with multiple orders.
- Show menu management: toggle an item to "Sold Out" → it grays out on the customer menu instantly.
- Show analytics: today's revenue, top items chart.

**[2:30 – 3:00] Business Case**

- "Every order through this app saves you 30% vs Grab."
- "At 50 orders/day averaging RM35, that's RM18,000/month in saved commission."
- "You own the customer data. You can re-market to them directly."
- "Questions?"

## Decision Log

| Date | Decision | Rationale |
| --- | --- | --- |
| Day 0 | Build from scratch (not fork Enatega) | Enatega is multi-vendor with proprietary backend — massive overkill for single-restaurant D2C. Next.js + Supabase is a direct match for all constraints. |
| Day 0 | Stripe Checkout (redirect) over Payment Element (embedded) | Simplest PCI compliance. Handles FPX/GrabPay out of the box. Less frontend code. |
| Day 0 | Zustand over Redux / Context | Lightweight, no boilerplate, built-in localStorage persistence middleware. Perfect for cart state. |
| Day 0 | shadcn/ui over Chakra / MUI | Copy-paste components (no dependency lock-in), Tailwind-native, highly customizable, great defaults. |
| Day 0 | Prices in cents (integer) | Avoid floating-point arithmetic errors. RM 12.50 = 1250. All math is integer-only. |
| Day 0 | Lalamove MOTORCYCLE service type | Food delivery in KL is 95% motorcycle. Fastest and cheapest. |
| Day 0 | Denormalize names/prices in order_items | Historical accuracy: if menu item name or price changes later, past orders still show what was actually ordered. |

*Updated as milestones are completed.*