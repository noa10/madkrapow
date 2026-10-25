# architecture.md — Mad Krapow D2C: System Architecture

This document describes the high-level architecture, key design decisions, component map, and data flows.
It should be read alongside plans.md (execution plan) and referenced by implement.md.
Keep this aligned with the codebase as it evolves; revisit quarterly.

---

## Bird's-Eye View

Mad Krapow is a single-restaurant D2C food ordering web app. The customer visits the website,
browses the menu, customizes items with modifiers, enters a delivery address, receives a live
delivery fee quote, pays via Stripe, and tracks their order in real-time.

Behind the scenes, payment confirmation triggers an automated Lalamove driver booking.
The kitchen manages orders via a real-time admin dashboard. Delivery status updates from
Lalamove flow back through webhooks into the customer's tracking page.

---

## System Architecture Diagram

```mermaid
graph TB
    subgraph "Customer Device (Mobile Browser / PWA)"
        A[Next.js App - RSC + Client Components]
    end

    subgraph "Native Mobile Apps (Flutter)"
        N1["Customer app<br/>apps/mobile"]
        N2["Merchant app<br/>apps/merchant"]
    end

    subgraph "Vercel Edge Network"
        B[Next.js App Router]
        C[API Routes /api/*]
        D[Server Actions]
    end

    subgraph "Supabase Cloud"
        E[(PostgreSQL Database)]
        F[Supabase Auth]
        G[Supabase Realtime]
        H[Supabase Storage]
        I[Edge Functions]
    end

    subgraph "External Services"
        J[Stripe Payments API]
        K[Lalamove Delivery API v3]
        L[Google Maps / Places API]
        M[Resend Email API]
    end

    A -->|HTTPS| B
    B --> C
    B --> D
    C -->|Server Client| E
    C -->|Webhook| J
    C -->|Webhook| K
    C -->|REST| K
    C -->|REST| L
    C -->|REST| M
    D -->|Server Client| E
    A -->|WebSocket| G
    A -->|Anon Client| F
    H -->|CDN| A

    J -->|checkout.session.completed| C
    K -->|ORDER_STATUS_CHANGED| C
    G -->|postgres_changes| A

    N1 -->|Anon Client| F
    N1 -->|WebSocket| G
    N1 -->|"HTTPS: checkout, quotes, profile"| C
    N2 -->|Anon Client| F
    N2 -->|WebSocket| G
    N2 -->|"HTTPS: admin writes, analytics"| C
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | Next.js (App Router) | 14.x+ | SSR/RSC for SEO + performance, API routes for webhooks, Server Actions for mutations |
| **Language** | TypeScript | 5.x (strict) | Type safety across entire stack |
| **Database** | Supabase (PostgreSQL) | Latest | Relational data, RLS, Realtime subscriptions |
| **Auth** | Supabase Auth | Latest | Google OAuth, magic link email, JWT sessions |
| **Realtime** | Supabase Realtime | Latest | postgres_changes for live order status updates |
| **Storage** | Supabase Storage | Latest | Menu item images, receipts |
| **Payments** | Stripe | Latest | Checkout Sessions, webhooks, MYR + FPX + GrabPay |
| **Delivery** | Lalamove API | v3 | Quotations, order placement, status webhooks |
| **Maps** | Google Maps JS API | Latest | Places Autocomplete, geocoding |
| **Styling** | Tailwind CSS | 3.x | Utility-first, mobile-first responsive design |
| **Components** | shadcn/ui | Latest | Accessible, composable primitives (Dialog, Sheet, Select, etc.) |
| **Client State** | Zustand | 4.x | Cart store with localStorage persistence |
| **Server State** | SWR | 2.x | Client-side data fetching with caching + revalidation |
| **Email** | Resend + React Email | Latest | Transactional emails with React-based templates |
| **Validation** | Zod | 3.x | Schema validation for API inputs, form data, env vars |
| **Testing** | Vitest + Playwright | Latest | Unit tests + E2E tests |
| **Monitoring** | Sentry + Vercel Analytics | Latest | Error tracking + performance metrics |
| **Hosting** | Vercel | — | Edge network, auto-scaling, preview deploys |

---

## Native Mobile Apps (Flutter)

Two Flutter apps ship alongside the web app. They are **clients of the same backend** — there is no
separate mobile API. Both live in `apps/` and share the `packages/madkrapow_orders` contract.

| App | Path | Audience | Purpose |
|---|---|---|---|
| **Customer** | `apps/mobile` | Diners | Browse the menu, order, pay, track delivery |
| **Merchant** | `apps/merchant` | Store staff | Orders, kitchen display, menu, employees, promos, analytics, settings |

### Shared design system

`packages/madkrapow_ui` is the single source of truth for the Flutter visual language. Both apps
depend on it by path, so the customer storefront and the merchant admin share tokens and widgets
without sharing navigation or screen layouts.

- **Tokens** mirror `apps/web/src/app/globals.css`: background `#0D0D0F`, surface `#18181B`,
  accent crimson `#E11D48`, ember prices `#F66018`, and the semantic status palette. When the web
  tokens change, update `AppColors` and keep the shared theme test green.
- **Theme** is dark-only. `AppTheme.darkTheme` is wired into both `MaterialApp`s; `lightTheme`
  remains a compatibility alias. Typography is Plus Jakarta Sans, actions are pill-shaped, and cards
  use 16px corners with hairline borders.
- **Widgets** such as `StatusPill`, `AppCard`, `AppLogo`, `AppPriceText`, `SectionHeading`,
  `GradientCta`, and `AppEmptyState` keep repeated visual patterns consistent. Use
  `AppStatusColors.of(status)` rather than ad-hoc status colours.
- **Brand assets** (logo, hero image, font) ship with the package. Reference them through `AppLogo`
  or `AppAssets` so the `packages/madkrapow_ui/...` asset prefix stays correct.
- **Boundaries**: the customer app follows the storefront layout; the merchant app follows the web
  admin layout. This package owns colour, type, shape, elevation, and shared components only — not
  routes, providers, business logic, or screen structure.

### Shared order-status contract

`packages/madkrapow_orders/order_status.json` is the machine source of truth for the order state
machine. It generates `apps/web/src/lib/orders/status.ts` and the Dart constants in
`packages/madkrapow_orders/lib/order_status.g.dart`. `npm run lint:parity` fails CI if the JSON
spec, the TypeScript module, the Dart package, and the SQL `CHECK` constraint disagree. See
[`docs/order-status-spec.md`](order-status-spec.md) for the human-facing version.

### Data access pattern

Both apps use a **hybrid** read/write split, applied consistently except where noted in the audit:

- **Reads** go directly to Supabase with the user's JWT, relying on RLS (`service_role` is never
  used client-side).
- **Writes** that need server-side validation or an audit trail go through the web API
  (`/api/admin/**`, `/api/checkout/**`) using `WEB_API_URL`.
- **Realtime** uses Supabase `postgres_changes` channels, with polling as a fallback on
  order-tracking screens.

### Android release

Releases are tag-driven: pushing `mobile-v*` or `merchant-v*` triggers
`.github/workflows/android-release.yml`, which builds a signed AAB + APK and opens a draft GitHub
release. Both apps also carry an in-app GitHub APK updater. See
[`docs/android-release.md`](android-release.md).

### Caveat: generated models

The `lib/generated/` table models in both apps come from `supabase_codegen` and are **not**
regenerated automatically. They were last generated on 2026-04-11 and are behind the migration
history — see the 2026-10-15 audit in [`docs/audits/`](audits/) for the current gap and its
consequences.

---

## Codemap

```
mad-krapow/
├── docs/
│   ├── prompt.md              # Project goals, spec, deliverables (this pack)
│   ├── plans.md               # Milestones, risk register, demo script
│   ├── architecture.md        # THIS FILE
│   ├── implement.md           # Execution prompt referencing the plan
│   └── documentation.md       # Milestone status + decisions + troubleshooting
│
├── apps/
│   ├── web/
│   │   ├── src/                        # Next.js application source
│   │   ├── public/                     # Static assets
│   │   ├── middleware.ts               # Next.js middleware entrypoint
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.mjs
│   │   ├── tsconfig.json
│   │   ├── next-env.d.ts
│   │   ├── package.json
│   │   └── .env.local.example
│   │
│   ├── mobile/                         # Flutter customer app (Android/iOS)
│   │   ├── lib/
│   │   │   ├── features/               # auth, menu, cart, checkout, orders, profile
│   │   │   ├── core/                   # shell, widgets, updater, utils
│   │   │   ├── config/                 # routes, theme, env (envied)
│   │   │   └── generated/              # supabase_codegen table models
│   │   ├── android/ · ios/             # platform shells
│   │   ├── test/
│   │   └── pubspec.yaml
│   │
│   └── merchant/                       # Flutter store-staff app (Android/iOS)
│       ├── lib/
│       │   ├── features/               # orders, kitchen, menu, employees, promos,
│       │   │                           #   analytics, settings, notifications
│       │   ├── core/                   # shell, roles, updater, utils
│       │   ├── config/                 # routes, theme, env (envied)
│       │   └── generated/              # supabase_codegen table models
│       ├── android/ · ios/             # platform shells
│       ├── test/
│       └── pubspec.yaml
│
├── packages/
│   ├── shared-types/
│   │   ├── package.json
│   │   └── typescript/
│   │       └── db.ts                   # Generated Supabase database types
│   │
│   ├── madkrapow_orders/               # Canonical order-status contract, shared by
│   │   ├── order_status.json           #   web + both Flutter apps. Generated from
│   │   ├── lib/order_status.g.dart     #   the JSON spec; `npm run lint:parity` fails
│   │   └── tool/generate.dart          #   CI if any platform drifts from it
│   │
│   └── madkrapow_ui/                   # Shared Fiery Wok design system for both apps
│       ├── lib/src/tokens/             # colours, radii, type, brand extension, assets
│       ├── lib/src/theme.dart          # canonical dark ThemeData
│       ├── lib/src/widgets/            # AppCard, StatusPill, AppLogo, GradientCta, ...
│       ├── assets/                     # Plus Jakarta Sans, logo, hero image
│       └── test/                       # token and widget coverage
│
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_indexes.sql
│   ├── seed.sql
│   └── config.toml
│
├── e2e/
│   ├── ordering-flow.spec.ts
│   ├── admin-orders.spec.ts
│   └── fixtures/
│       └── test-data.ts
│
├── scripts/
│   └── seed.ts                       # Menu data seeding script
│
├── eslint.config.mjs                 # Repo-level lint config
├── vitest.config.ts                  # Repo-level unit test config
├── playwright.config.ts              # Repo-level E2E config
└── package.json                      # Workspace orchestration package
```

Application paths below are shown relative to `apps/web/src/`.

```
apps/web/src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── layout.tsx                # Root layout: fonts, metadata, providers
│   │   ├── page.tsx                  # Menu page (hero + categories + items)
│   │   ├── item/[id]/page.tsx        # Item detail with modifiers
│   │   ├── cart/page.tsx             # Cart review + delivery address
│   │   ├── checkout/
│   │   │   ├── page.tsx              # Order summary → Stripe redirect
│   │   │   └── success/page.tsx      # Post-payment confirmation
│   │   ├── order/[id]/page.tsx       # Real-time order tracking
│   │   ├── orders/page.tsx           # Order history (auth required)
│   │   ├── auth/
│   │   │   ├── page.tsx              # Login / signup
│   │   │   └── callback/route.ts     # OAuth callback handler
│   │   ├── admin/
│   │   │   ├── layout.tsx            # Admin shell with sidebar + auth guard
│   │   │   ├── page.tsx              # Dashboard overview
│   │   │   ├── orders/
│   │   │   │   ├── page.tsx          # Live order feed
│   │   │   │   └── [id]/page.tsx     # Order detail + status mgmt
│   │   │   ├── menu/
│   │   │   │   ├── page.tsx          # Menu item list + CRUD
│   │   │   │   ├── [id]/page.tsx     # Edit item
│   │   │   │   └── new/page.tsx      # Create item
│   │   │   ├── analytics/page.tsx    # Revenue + order analytics
│   │   │   └── settings/page.tsx     # Store hours, config
│   │   └── api/
│   │       ├── menu/route.ts                 # GET: full menu
│   │       ├── delivery/quote/route.ts       # POST: Lalamove quotation
│   │       ├── checkout/route.ts             # POST: create order + Stripe session
│   │       ├── webhooks/
│   │       │   ├── stripe/route.ts           # POST: payment events
│   │       │   └── lalamove/route.ts         # POST: delivery status events
│   │       ├── orders/
│   │       │   ├── route.ts                  # GET: user's order history
│   │       │   └── [id]/route.ts             # GET: single order
│   │       └── admin/
│   │           ├── menu/route.ts             # CRUD: menu items
│   │           ├── menu/[id]/route.ts        # CRUD: single item
│   │           ├── orders/[id]/route.ts      # PATCH: update order status
│   │           ├── upload/route.ts           # POST: image upload
│   │           └── analytics/route.ts        # GET: revenue + metrics
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx            # Logo, cart badge, auth button
│   │   │   ├── Footer.tsx            # Links, social, legal
│   │   │   ├── MobileNav.tsx         # Bottom tab bar
│   │   │   └── CartDrawer.tsx        # Slide-out cart panel
│   │   ├── menu/
│   │   │   ├── CategoryNav.tsx       # Sticky horizontal scroll tabs
│   │   │   ├── CategorySection.tsx   # Category title + item grid
│   │   │   ├── MenuItemCard.tsx      # Item card with "Add" button
│   │   │   ├── MenuItemDetail.tsx    # Full item view with modifiers
│   │   │   ├── ModifierGroup.tsx     # Radio or checkbox group
│   │   │   ├── ModifierOption.tsx    # Single modifier row
│   │   │   ├── QuantitySelector.tsx  # +/- buttons
│   │   │   └── StoreClosedBanner.tsx # Operating hours check
│   │   ├── cart/
│   │   │   ├── CartItem.tsx
│   │   │   ├── CartSummary.tsx
│   │   │   ├── DeliveryAddressInput.tsx
│   │   │   ├── DeliveryFeeDisplay.tsx
│   │   │   └── SavedAddressSelector.tsx
│   │   ├── checkout/
│   │   │   ├── OrderReview.tsx
│   │   │   ├── PromoCodeInput.tsx
│   │   │   └── PaymentButton.tsx
│   │   ├── order/
│   │   │   ├── OrderStatusTracker.tsx
│   │   │   ├── OrderDetails.tsx
│   │   │   ├── DriverInfo.tsx
│   │   │   ├── OrderCard.tsx
│   │   │   └── ReorderButton.tsx
│   │   ├── admin/
│   │   │   ├── OrderFeed.tsx
│   │   │   ├── OrderTicket.tsx
│   │   │   ├── StatusTransitionButtons.tsx
│   │   │   ├── MenuEditor.tsx
│   │   │   ├── ModifierEditor.tsx
│   │   │   ├── ImageUpload.tsx
│   │   │   ├── StatsCard.tsx
│   │   │   ├── RevenueChart.tsx
│   │   │   └── TopItemsTable.tsx
│   │   ├── auth/
│   │   │   ├── AuthForm.tsx
│   │   │   └── AuthGuard.tsx
│   │   └── ui/                       # shadcn/ui primitives
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       ├── dialog.tsx
│   │       ├── sheet.tsx
│   │       ├── badge.tsx
│   │       ├── skeleton.tsx
│   │       ├── select.tsx
│   │       └── toast.tsx
│   │
│   ├── stores/
│   │   └── cart.ts                   # Zustand cart store + localStorage middleware
│   │
│   ├── hooks/
│   │   ├── useOrderTracking.ts       # Supabase Realtime subscription
│   │   ├── useStoreStatus.ts         # Check operating hours
│   │   └── useAdminOrders.ts         # Realtime admin order feed
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts             # createServerClient (RSC + API routes)
│   │   │   ├── client.ts             # createBrowserClient (client components)
│   │   │   └── middleware.ts          # Session refresh middleware
│   │   ├── stripe/
│   │   │   └── client.ts             # Stripe SDK initialization
│   │   ├── lalamove/
│   │   │   ├── client.ts             # Lalamove SDK/HTTP client
│   │   │   ├── auth.ts               # HMAC-SHA256 signature generation
│   │   │   └── book.ts               # Quote + order placement logic
│   │   ├── google-maps/
│   │   │   └── places.ts             # Autocomplete + geocoding helpers
│   │   ├── email/
│   │   │   ├── send-confirmation.ts
│   │   │   ├── send-receipt.ts
│   │   │   └── templates/
│   │   │       ├── order-confirmation.tsx
│   │   │       └── receipt.tsx
│   │   ├── validators/
│   │   │   ├── checkout.ts           # Zod: cart + delivery + customer
│   │   │   ├── menu.ts               # Zod: admin menu CRUD
│   │   │   └── env.ts                # Zod: environment variables
│   │   ├── queries/
│   │   │   ├── menu.ts               # getMenu, getMenuItem
│   │   │   ├── orders.ts             # getOrder, getUserOrders
│   │   │   └── analytics.ts          # getRevenue, getTopItems
│   │   ├── services/
│   │   │   └── order-fulfillment.ts  # Orchestrates: payment → Lalamove → status
│   │   └── utils/
│   │       ├── format-price.ts       # cents → "RM XX.XX"
│   │       ├── operating-hours.ts    # isStoreOpen(settings, now)
│   │       └── constants.ts          # Order statuses, delivery statuses
│   │
│   └── types/
│       ├── database.types.ts         # Re-export shim for @madkrapow/shared-types
│       ├── menu.ts                   # MenuItemWithModifiers, etc.
│       ├── order.ts                  # OrderWithItems, etc.
│       ├── cart.ts                   # CartItem, CartState
│       └── lalamove.ts              # QuotationResponse, OrderResponse
```

---

## Key Design Decisions

### 1. Server Components by Default, Client Components When Necessary

The menu page is 100% Server Components — data fetched at request time from Supabase server client.
This gives us:
- Zero client-side JavaScript for menu rendering (fast LCP).
- SEO-friendly HTML output (Google can index the menu).
- Secure: Supabase service_role key never reaches the browser.

Client Components are used only where interactivity is required:
- Cart state (Zustand store needs `use client`).
- Modifier selection (radio/checkbox interactions).
- Realtime subscriptions (Supabase Realtime WebSocket).
- Google Maps autocomplete (imperative DOM API).

### 2. Prices in Cents (Integer Arithmetic Only)

All monetary values in the database and application are stored as integers in the smallest currency unit (cents for MYR). RM 12.50 is stored as `1250`.

Why: floating-point arithmetic causes rounding errors. `0.1 + 0.2 !== 0.3` in JavaScript.
With integers: `10 + 20 === 30` — always correct.

Formatting happens at the display layer only: `formatPrice(1250)` → `"RM 12.50"`.

### 3. Webhook Security Pattern

Both Stripe and Lalamove webhooks follow the same security pattern:

```
1. Read raw request body (do NOT parse JSON first).
2. Verify cryptographic signature against raw body.
3. If invalid → return 400, log warning, exit.
4. Parse JSON only after signature verification.
5. Check idempotency (has this event already been processed?).
6. Process event.
7. Return 200 immediately (do async work after acknowledging).
```

For Stripe: `stripe.webhooks.constructEvent(body, signature, secret)`.
For Lalamove: HMAC-SHA256 verification against webhook secret.

### 4. Order Fulfillment Pipeline (Critical Path)

```
[Customer pays] ─── Stripe Checkout ───→ [Stripe webhook fires]
                                              │
                                              ▼
                                    [Verify signature]
                                              │
                                              ▼
                                    [Update order → PAID]
                                              │
                                              ▼
                                  [Check quotation freshness]
                                         │           │
                                    < 4 min       ≥ 4 min
                                         │           │
                                         │      [Re-quote Lalamove]
                                         │           │
                                         ▼           ▼
                                    [Place Lalamove order]
                                              │
                                         ┌────┴────┐
                                     Success     Failure
                                         │           │
                                         ▼           ▼
                            [Store lalamove_order_id]  [Flag for manual dispatch]
                            [delivery_status=ASSIGNING] [Alert owner]
                                         │
                                         ▼
                              [Supabase Realtime pushes
                               status to customer browser]
```

### 5. Supabase Row-Level Security Model

| Table | Anonymous | Authenticated User | Service Role (webhooks/admin) |
|---|---|---|---|
| categories | SELECT | SELECT | ALL |
| menu_items | SELECT | SELECT | ALL |
| modifier_groups | SELECT | SELECT | ALL |
| modifiers | SELECT | SELECT | ALL |
| menu_item_modifier_groups | SELECT | SELECT | ALL |
| customers | — | SELECT/UPDATE own row | ALL |
| customer_addresses | — | ALL own rows | ALL |
| orders | — | SELECT own rows; INSERT | ALL |
| order_items | — | SELECT via order ownership | ALL |
| order_item_modifiers | — | SELECT via order ownership | ALL |
| store_settings | SELECT | SELECT | ALL |
| promo_codes | SELECT (active only) | SELECT (active only) | ALL |

Webhooks and admin operations use the `service_role` key which bypasses RLS.

### 6. Cart Architecture (Client-Side)

```typescript
// Zustand store shape
interface CartState {
  items: CartItem[];
  deliveryQuote: DeliveryQuote | null;
  
  addItem: (item: CartItem) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  setDeliveryQuote: (quote: DeliveryQuote) => void;
  clearCart: () => void;
  
  // Computed
  subtotal: () => number;     // Sum of all items (cents)
  itemCount: () => number;    // Total item count
  total: () => number;        // subtotal + deliveryFee
}

interface CartItem {
  cartItemId: string;         // UUID generated client-side for list keys
  menuItemId: string;
  name: string;
  basePrice: number;          // cents
  quantity: number;
  modifiers: SelectedModifier[];
  specialInstructions: string;
  totalPrice: number;         // (basePrice + sum(modifier.priceDelta)) * quantity
}
```

The cart store uses Zustand's `persist` middleware with `localStorage` backend.
Cart is never sent to the server as-is — the checkout endpoint receives `menuItemId` +
`modifierId[]` + `quantity`, then re-fetches all prices from DB for validation.

### 7. Real-Time Architecture

Two Supabase Realtime channels are used:

**Customer order tracking:**
```
Channel: `order-${orderId}`
Event: postgres_changes (UPDATE on orders WHERE id = orderId)
Payload: full row → updates OrderStatusTracker + DriverInfo
```

**Admin order feed:**
```
Channel: `admin-orders`
Event: postgres_changes (INSERT on orders)
       postgres_changes (UPDATE on orders)
Payload: new/updated row → updates OrderFeed, plays audio on INSERT
```

---

## Multi-Channel Order Model (POS)

MadKrapow is the single source of truth for orders from every sales channel.
GrabFood (and later Foodpanda) are **sales channels**, not separate order
systems — the canonical order always lives in the `orders` table.

```
Counter POS (/pos) ─┐
Web checkout ───────┤   orders.source:
Telegram / WhatsApp ─┼─►  web | telegram | whatsapp | mobile | counter
GrabFood webhook ───┤     | grabfood | foodpanda
Foodpanda (future) ─┘
        │
        ├── order_items (menu/price snapshots)
        ├── payments / refunds (money movement is first-class)
        ├── channel_orders (external identity; UNIQUE(channel, external_order_id)
        │      is the webhook idempotency anchor)
        └── order_events (audit)
```

Key pieces (see `docs/grabfood-integration.md` for the GrabFood specifics):

- **Money is integer sen everywhere**, matching Grab's MYR minor units.
- **Ingestion is atomic + idempotent** via the `import_channel_order` /
  `import_legacy_order` RPCs (migrations 051/052): order + items + payment +
  channel identity + audit land together or not at all, and a replayed webhook
  reports `duplicate` instead of creating a second order.
- **No new order statuses.** Channel lifecycles map onto the existing
  8-status machine (`lib/grabfood/mapper.ts` plans the transitions; routes
  apply them with atomic conditional updates). `npm run lint:parity` stays the
  cross-platform contract.
- **Refunds are `refunds` rows linked to their original order** — never
  negative orders. The legacy Aliments POS export (816 orders, 2026-03 →
  2026-05) is imported with a full audit trail in `legacy_import_records`
  (`scripts/import-legacy-pos/`, re-runnable: idempotent).
- **Menu is per-channel through `channel_products`**: the local product is the
  master; channel rows hold external IDs, channel price overrides and
  availability. The counter POS screen (`/pos`) creates orders through the
  same server-validated engine as web checkout.

---

## Architectural Invariants

These must hold true at all times:

1. **No client-sent price is ever trusted.** The checkout endpoint re-fetches every price from the database.
2. **No webhook is processed without signature verification.** Invalid signatures return 400 immediately.
3. **No order can skip a status.** Status transitions follow a defined state machine.
4. **All monetary arithmetic uses integers.** No `parseFloat` on prices, ever.
5. **Menu data is always server-rendered.** No loading spinners for the core menu experience.
6. **RLS is enabled on every table.** No table exists without a security policy.
7. **Environment variables are validated at startup.** Missing vars crash the build, not the runtime.

---

## Design System Tokens

| Token | Value | Usage |
|---|---|---|
| `--color-primary` | `#E53E3E` | CTA buttons, active states, price highlights |
| `--color-primary-hover` | `#C53030` | Button hover |
| `--color-secondary` | `#38A169` | Success states, "Open" badge, add-to-cart |
| `--color-background` | `#FAFAFA` | Page background |
| `--color-surface` | `#FFFFFF` | Cards, modals, sheets |
| `--color-text-primary` | `#1A202C` | Headings, item names |
| `--color-text-secondary` | `#718096` | Descriptions, labels |
| `--color-border` | `#E2E8F0` | Card borders, dividers |
| `--font-heading` | `'Plus Jakarta Sans', sans-serif` | All headings (600, 700) |
| `--font-body` | `'Inter', sans-serif` | Body text (400, 500) |
| `--radius-card` | `12px` | Cards, images |
| `--radius-button` | `8px` | Buttons, inputs |
| `--radius-badge` | `9999px` | Badges, pills |
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.08)` | Card elevation |
| `--shadow-sheet` | `0 -4px 24px rgba(0,0,0,0.12)` | Bottom sheets, drawers |
