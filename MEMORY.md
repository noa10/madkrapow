# MEMORY.md — Mad Krapow Long-Term Memory

This file contains curated memories, decisions, and learnings that persist across sessions. This is your long-term memory — the distilled essence of what matters.

**Last Updated**: 2026-03-17

---

## Project Overview

**Mad Krapow** is a single-restaurant D2C food ordering web app built with Next.js 16, Supabase, Stripe, and Lalamove. The customer orders Thai street food online, pays via Stripe, and delivery is automatically booked through Lalamove. The kitchen manages orders via a real-time admin dashboard.

**Status**: In development, following 14-milestone execution plan (docs/plans.md)

---

## Key Architectural Decisions

### 2026-03-17: ECC Integration
- **Decision**: Merged ECC (Everything Claude Code) agent harness patterns into existing GitNexus setup
- **Rationale**: GitNexus provides code graph intelligence; ECC adds behavioral frameworks and persistent memory
- **Implementation**: Created SOUL.md, MEMORY.md, HEARTBEAT.md; enhanced AGENTS.md with ECC patterns
- **Impact**: AI assistants now have session continuity and defined working style

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
- Run GitNexus impact analysis before modifying payment/delivery code
- Test payment flows locally before committing
- Update this file when significant decisions or learnings occur

---

**Philosophy**: This file grows over time. Add what's worth remembering. Remove what's no longer relevant. Keep it focused and actionable.
