# implement.md — Mad Krapow D2C: Implementation Execution Prompt

You are Codex acting as a senior staff engineer implementing the Mad Krapow D2C web app.

## Before You Start

1. Read `docs/prompt.md` for project goals, constraints, and user stories.
2. Read `docs/plans.md` for the complete milestone plan, acceptance criteria, and risk register.
3. Read `docs/architecture.md` for system architecture, codemap, design decisions, and invariants.
4. Check `docs/documentation.md` for current milestone status and any prior decisions.

The repository is organized as a workspace. The Next.js app now lives in `apps/web`, so any legacy `src/...` references in the plan should be read as `apps/web/src/...`. Continue to run the documented verification commands from the repository root.

## Execution Rules

### Per-Milestone Workflow

For each milestone in plans.md, execute this loop:

```
1. READ the milestone scope, key files, and acceptance criteria.
2. IMPLEMENT all items in the scope.
3. VERIFY using the milestone's verification commands:
   - npm run lint        (zero errors)
   - npm run typecheck   (zero errors)
   - npm run test        (all tests pass)
   - npm run build       (production build succeeds)
   - Manual verification (as described in milestone)
4. FIX any issues found during verification.
5. COMMIT with a clear message: "milestone-N: <summary>"
6. UPDATE docs/documentation.md with:
   - Milestone status (✅ Complete)
   - Any decisions made during implementation
   - Any deviations from the plan (with rationale)
7. PROCEED to next milestone.
```

### Code Quality Standards

- **TypeScript strict mode.** No `any` types unless absolutely unavoidable (document why).
- **Zod validation** on all API route inputs and environment variables.
- **Error boundaries** around every client component tree that could fail.
- **Loading states** for every async operation (skeleton loaders, not spinners, for content).
- **Semantic HTML** — use `<nav>`, `<main>`, `<article>`, `<section>`, `<button>` correctly.
- **Accessible** — all interactive elements keyboard-navigable, ARIA labels on icon buttons.
- **Mobile-first CSS** — write base styles for 375px, then `md:` and `lg:` breakpoints.

### File Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Pages | `page.tsx` (Next.js convention) | `apps/web/src/app/cart/page.tsx` |
| Components | PascalCase | `apps/web/src/components/menu/MenuItemCard.tsx` |
| Hooks | camelCase with `use` prefix | `apps/web/src/hooks/useOrderTracking.ts` |
| Utilities | kebab-case | `apps/web/src/lib/utils/format-price.ts` |
| API Routes | `route.ts` (Next.js convention) | `apps/web/src/app/api/checkout/route.ts` |
| Types | PascalCase, `.ts` extension | `apps/web/src/types/order.ts` |
| Tests | `*.test.ts` or `*.spec.ts` | `apps/web/src/lib/utils/format-price.test.ts` |
| E2E Tests | `*.spec.ts` in `e2e/` | `e2e/ordering-flow.spec.ts` |

### API Route Pattern

Every API route should follow this pattern:

```typescript
// apps/web/src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

const RequestSchema = z.object({
  // Define expected shape
});

export async function POST(req: NextRequest) {
  try {
    // 1. Parse and validate input
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // 2. Auth check (if required)
    const supabase = await createServerClient();
    // ...

    // 3. Business logic
    // ...

    // 4. Return success response
    return NextResponse.json({ data: result }, { status: 200 });

  } catch (error) {
    console.error('[API] /api/example:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Webhook Route Pattern

```typescript
// apps/web/src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  // 1. Read RAW body (do NOT parse JSON)
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature')!;

  // 2. Verify signature FIRST
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('[Webhook] Invalid Stripe signature:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 3. Idempotency check
  // Check if event.id has been processed before

  // 4. Handle event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;
    // ...
  }

  // 5. Acknowledge immediately
  return NextResponse.json({ received: true }, { status: 200 });
}
```

### Supabase Client Pattern

```typescript
// Server Components / API Routes (uses cookies for auth context)
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// For server-side operations that need user context:
const supabase = createServerComponentClient({ cookies });

// For webhook/admin operations that bypass RLS:
import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Client Components (browser):
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
const supabase = createClientComponentClient();
```

### Component Pattern

```typescript
// apps/web/src/components/menu/MenuItemCard.tsx
import Image from 'next/image';
import { formatPrice } from '@/lib/utils/format-price';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MenuItem } from '@/types/menu';

interface MenuItemCardProps {
  item: MenuItem;
  onAdd: (itemId: string) => void;
}

export function MenuItemCard({ item, onAdd }: MenuItemCardProps) {
  // Component logic here
  // Keep components focused: one responsibility per component
  // Extract hooks for complex state logic
  // Use composition over prop drilling
}
```

## Milestone Execution Order

Execute milestones in this exact order. Do not skip ahead.

| Order | Milestone | Depends On |
|---|---|---|
| 1 | M0: Project Bootstrap | — |
| 2 | M1: Database Schema & Seed | M0 |
| 3 | M2: Menu Display | M1 |
| 4 | M3: Item Detail & Modifiers | M2 |
| 5 | M4: Cart State & UI | M3 |
| 6 | M5: Delivery Address & Lalamove Quote | M4 |
| 7 | M6: Stripe Checkout & Payment | M5 |
| 8 | M7: Stripe Webhook & Lalamove Auto-Booking | M6 |
| 9 | M8: Order Tracking (Real-Time) | M7 |
| 10 | M9: Auth & Customer Features | M8 |
| 11 | M10: Admin: Order Management | M8 |
| 12 | M11: Admin: Menu Management | M10 |
| 13 | M12: Admin: Settings & Analytics | M11 |
| 14 | M13: Email Notifications & SEO | M9 |
| 15 | M14: Testing, Polish & Launch | All |

Note: M9 and M10 can be parallelized if working with multiple agents/developers.

## Environment Variables

All required environment variables are documented in `apps/web/.env.local.example`.
Validate them at build time using Zod:

```typescript
// apps/web/src/lib/validators/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  LALAMOVE_API_KEY: z.string().min(1),
  LALAMOVE_API_SECRET: z.string().min(1),
  LALAMOVE_ENV: z.enum(['sandbox', 'production']),
  NEXT_PUBLIC_GOOGLE_MAPS_KEY: z.string().startsWith('AIza'),
  NEXT_PUBLIC_URL: z.string().url(),
  RESEND_API_KEY: z.string().startsWith('re_'),
  STORE_LATITUDE: z.string().transform(Number),
  STORE_LONGITUDE: z.string().transform(Number),
  STORE_ADDRESS: z.string().min(1),
  STORE_PHONE: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

## When You're Stuck

1. Re-read the acceptance criteria for the current milestone.
2. Check if an architectural invariant from architecture.md applies.
3. Check the risk register in plans.md for known edge cases.
4. If making a tradeoff, document it in plans.md Decision Log.
5. Prefer a working, simple solution over a clever, complex one.

## Start

Begin with Milestone 0. Go.
