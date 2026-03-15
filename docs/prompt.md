# prompt.md — Mad Krapow D2C Web App

You are Codex acting as a senior staff engineer and tech lead.
Build a production-ready, Vercel-deployed "Mad Krapow" direct-to-consumer food ordering web app from scratch.

## Context

Mad Krapow is a Thai street food restaurant in TTDI Jaya, Petaling Jaya, Malaysia.
They currently sell through Grab and FoodPanda (paying ~30% commission).
This app replaces those marketplace dependencies with an owned D2C channel: zero commission, full customer data, branded experience.

Reference menu: https://food.grab.com/my/en/restaurant/mad-krapow-ttdi-jaya-delivery/1-C36JLBD2PFD3LA
Design reference: Owner.com (clean, mobile-first, food-photography-forward, high-converting single-brand restaurant sites).

## Goals

This must be impressive to customers (fast, beautiful, frictionless mobile ordering with live delivery tracking).
This must also be impressive to engineers (clean architecture, strong types, tests, secure webhook pipelines, well-separated concerns).
You will run for hours: plan first, then implement milestone by milestone.
Do not skip the planning phase.

## Hard Constraints

- Tech stack: Next.js 14+ (App Router) + TypeScript + Tailwind CSS + shadcn/ui.
- Database & Auth: Supabase (PostgreSQL + Auth + Realtime + Edge Functions + Storage). RLS on all tables.
- Payments: Stripe (MYR currency, support card + FPX + GrabPay).
- Delivery: Lalamove API v3 (MY market, HMAC-SHA256 auth, motorcycle service type).
- Hosting: Vercel (edge network, preview deploys, environment variables).
- Maps: Google Maps / Places API (address autocomplete + geocoding).
- State: Zustand (cart) + SWR or React Query (server state).
- Email: Resend (order confirmation + receipts).
- Monitoring: Vercel Analytics + Sentry.
- All API keys must be server-side only (never exposed to client).
- All prices stored in cents (integer) to avoid floating point errors.
- Mobile-first design: primary breakpoint 375px, desktop is secondary.

## Non-Goals (V1)

- Native mobile app (future V2 with React Native / Expo).
- Multi-vendor / multi-branch support.
- Table reservations or dine-in ordering.
- Custom rider/driver app (Lalamove handles delivery fleet).
- Inventory management or ingredient-level tracking.
- Multi-language support (English only for V1; Malay labels in DB for future).

## Deliverables

1. Fully functional customer-facing ordering web app (menu → cart → checkout → payment → tracking).
2. Admin dashboard (live order feed, order status management, menu CRUD, store settings, basic analytics).
3. Automated delivery pipeline (Stripe payment → Lalamove driver booking → real-time tracking).
4. Complete Supabase schema with RLS policies and seed data.
5. Playwright E2E tests covering critical ordering flow.
6. Deployed to Vercel on custom domain.

## User Stories

### Customer-Facing
- US-01: Browse the full menu in a mobile-first interface with category navigation.
- US-02: Select item modifiers (spice level, protein, extras) with real-time price updates.
- US-03: Enter delivery address (Google Places autocomplete) and see live Lalamove delivery fee.
- US-04: Pay securely via Stripe (cards, FPX, GrabPay) in MYR.
- US-05: Track order status in real-time (Confirmed → Preparing → Ready → Picked Up → Delivered).
- US-06: Sign in (magic link / Google OAuth) to see order history and saved addresses.
- US-07: Re-order a previous order in one tap.

### Admin/Operations
- US-08: System auto-books Lalamove driver when Stripe payment succeeds.
- US-09: Real-time order dashboard with status management.
- US-10: Menu management CRUD (categories, items, modifier groups, modifiers).
- US-11: Revenue and order analytics (daily/weekly/monthly).
- US-12: Store operating hours with auto-disable outside hours.

## Working Style

- Implement one milestone at a time.
- After each milestone: run verification commands, fix issues, commit with a clear message.
- Keep diffs reviewable and avoid giant unstructured changes.
- Prefer correctness and security over extra features.
- Document tradeoffs and decisions in plans.md as you go.
- All server-side mutations must validate prices against DB (prevent client-side price manipulation).
- All webhook handlers must verify signatures before processing.

## Start

First, read plans.md and architecture.md to understand the full plan.
Then, implement milestone by milestone, following implement.md for the execution prompt.
Update documentation.md with status and decisions after each milestone.
