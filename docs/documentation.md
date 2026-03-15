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
cp .env.local.example .env.local
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
npx supabase gen types typescript --local > src/types/database.ts
                          # Regenerate TypeScript types from schema

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
├── supabase/                # Database migrations and seed data
├── src/                     # Next.js application source
│   ├── app/                 # Pages and API routes (App Router)
│   ├── components/          # React components (by domain)
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Business logic, integrations, utilities
│   ├── stores/              # Zustand stores
│   └── types/               # TypeScript type definitions
├── e2e/                     # Playwright end-to-end tests
├── public/                  # Static assets (icons, manifest)
└── scripts/                  # Build and maintenance scripts
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
- All variables are validated at build time via Zod (see `src/lib/validators/env.ts`).

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
npx supabase gen types typescript --local > src/types/database.ts
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
# Copy the webhook signing secret (whsec_...) to .env.local
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
