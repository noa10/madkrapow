# TOOLS.md — Mad Krapow Project-Specific Notes

This file contains project-specific tools, patterns, shortcuts, and local development notes.

**Last Updated**: 2026-03-17

---

## API Credentials & Patterns

### Stripe
- **Test Mode**: Use test API keys from `.env.local`
- **Test Cards**: `4242 4242 4242 4242` (any future expiry, any CVC)
- **Webhook Testing**: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
- **Webhook Secret**: Stored in `STRIPE_WEBHOOK_SECRET` env var
- **Payment Methods**: Card, FPX, GrabPay (MYR)

### Lalamove
- **Sandbox**: Use sandbox credentials for development
- **Auth Pattern**: HMAC-SHA256 signature (see src/lib/lalamove/auth.ts)
- **Service Type**: MOTORCYCLE (fastest for KL food delivery)
- **Quotation Expiry**: 5 minutes (re-quote if > 4 min old)
- **Webhook Testing**: Use ngrok or similar to expose localhost

### Supabase
- **Local Development**: `npx supabase start` (Docker required)
- **Migrations**: `npx supabase db reset` (reset + seed)
- **Type Generation**: `npx supabase gen types typescript --local > src/types/database.ts`
- **RLS Testing**: Use anon key for client, service_role for webhooks

### Google Maps
- **API Key**: Stored in `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- **APIs Enabled**: Places API, Geocoding API
- **Autocomplete**: Restrict to Malaysia (`componentRestrictions: {country: 'my'}`)

---

## Local Development Shortcuts

### Quick Start
```bash
npm run dev                    # Start Next.js dev server
npx supabase start            # Start local Supabase (Docker)
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### Testing
```bash
npm run typecheck             # TypeScript check
npm run lint                  # ESLint
npm run build                 # Production build test
npm run test:e2e              # Playwright E2E tests
npm run test:e2e:ui           # Playwright UI mode
```

### Database
```bash
npx supabase db reset         # Reset DB + run migrations + seed
npx supabase db push          # Push local migrations to remote
npx supabase db pull          # Pull remote schema to local
npx supabase migration new <name>  # Create new migration
```

### GitNexus
```bash
npx gitnexus analyze          # Re-index codebase
npx gitnexus status           # Check index freshness
npx gitnexus wiki             # Generate documentation
```

---

## Common Patterns

### Price Calculation
```typescript
// Always use cents (integers)
const basePrice = 1250; // RM 12.50
const modifierDelta = 200; // +RM 2.00
const quantity = 2;
const total = (basePrice + modifierDelta) * quantity; // 2900 cents = RM 29.00

// Format for display
import { formatPrice } from '@/lib/utils/format-price';
formatPrice(2900); // "RM 29.00"
```

### Webhook Signature Verification
```typescript
// Stripe
const signature = headers.get('stripe-signature');
const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

// Lalamove
import { generateLalamoveSignature } from '@/lib/lalamove/auth';
const expectedSignature = generateLalamoveSignature(secret, timestamp, method, path, body);
if (signature !== expectedSignature) return new Response('Invalid signature', { status: 400 });
```

### Supabase Realtime Subscription
```typescript
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

// Cleanup
return () => { supabase.removeChannel(channel); };
```

---

## Environment Variables

### Required for Development
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Lalamove
LALAMOVE_API_KEY=
LALAMOVE_API_SECRET=
LALAMOVE_MARKET=MY_KUL

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=

# Resend (Email)
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

See `.env.local.example` for complete list.

---

## Debugging Tips

### Payment Flow Issues
1. Check Stripe webhook logs in dashboard
2. Verify webhook signature is correct
3. Check order status in Supabase
4. Look for errors in Vercel logs (production) or terminal (local)

### Lalamove Booking Failures
1. Check quotation freshness (must be < 5 min old)
2. Verify HMAC signature is correct
3. Check Lalamove sandbox/production dashboard
4. Look for `lalamove_order_id` in orders table

### Real-Time Updates Not Working
1. Check Supabase Realtime is enabled for table
2. Verify channel subscription is active
3. Check RLS policies allow SELECT for user
4. Look for WebSocket connection errors in browser console

### Build Failures
1. Run `npm run typecheck` to find TypeScript errors
2. Run `npm run lint` to find ESLint issues
3. Check for missing environment variables
4. Verify all imports are correct

---

## Useful Commands

### Clear All Data (Fresh Start)
```bash
npx supabase db reset         # Reset local DB
rm -rf .next                  # Clear Next.js cache
npm run build                 # Rebuild
```

### Generate Types from Supabase
```bash
npx supabase gen types typescript --local > src/types/database.ts
```

### Test Stripe Webhook Locally
```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Forward webhooks
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Terminal 3: Trigger test event
stripe trigger checkout.session.completed
```

### Check for Secrets in Code
```bash
git grep -E "(sk_live|pk_live|service_role)" -- '*.ts' '*.tsx' '*.js'
```

---

## Project-Specific Notes

### Operating Hours
- Stored in `store_settings` table as JSONB
- Format: `{"monday": {"open": "10:00", "close": "22:00"}, ...}`
- Check with `isStoreOpen(settings, now)` utility

### Order State Machine
```
PENDING → PAID → ACCEPTED → PREPARING → READY → PICKED_UP → DELIVERED
                                                           ↓
                                                      CANCELLED
```

### Delivery Fee Calculation
- Lalamove provides quotation with breakdown
- Store `quotationId` with order
- Re-quote if quotation > 4 min old before booking

### Menu Item Availability
- Toggle `is_available` in `menu_items` table
- Admin can mark items as "Sold Out"
- Customer menu filters out unavailable items

---

## Camera/SSH/Voice (Not Applicable)

This project doesn't use camera, SSH, or voice features. If needed in future, document here.

---

**Philosophy**: Keep this file updated with patterns you use frequently. Remove what's no longer relevant. This is your quick reference guide.
