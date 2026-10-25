# Billplz payments (sandbox-first)

Billplz is the second checkout payment method alongside Stripe. Customers choose
it on `/checkout` and pay with FPX online banking; Billplz hosts the bank
selection and confirmation pages.

The integration uses **Billplz API v3**. Sandbox and production are separate
accounts with separate keys and base URLs — sandbox keys never work against
production, and vice versa.

## How it works

```
/checkout (choose Billplz)
  └─ POST /api/checkout/create
       ├─ validates cart/prices/promos server-side
       ├─ creates the order (status = pending)
       ├─ POST https://www.billplz-sandbox.com/api/v3/bills
       └─ returns bill.url → browser redirects to Billplz

Customer pays FPX at Billplz
  ├─ Billplz POSTs to /api/webhooks/billplz (X Signature callback)
  │    ├─ verifies signature with BILLPLZ_X_SIGNATURE_KEY
  │    ├─ re-reads the bill from the Billplz API (authoritative paid state)
  │    ├─ checks paid_amount === orders.total_cents
  │    ├─ records payments(method = 'billplz')
  │    └─ finalizePaidOrder → preparing + Lalamove/HubboPOS/notifications
  └─ browser returns to /order/success?orderId=…&billplz[id]=…
       └─ polls the order; if the webhook is late, /api/checkout/verify
          re-checks the bill with Billplz
```

The paid-order transition is shared with the Stripe webhook
(`apps/web/src/lib/services/order-payment.ts`), so both gateways get the same
idempotent handling, kitchen notification, HubboPOS sync, and delivery dispatch.

## Sandbox setup

1. Create/sign in to a [Billplz sandbox](https://www.billplz-sandbox.com)
   account. Sandbox credentials are separate from production.
2. Create a **Collection** (Bills → Collections) and copy its ID.
3. Open **Settings → Keys & Integration** and copy:
   - the **Secret Key** (API authentication),
   - the **X Signature Key** (callback verification).
4. Add the values to `apps/web/.env.local`:

   ```dotenv
   BILLPLZ_ENABLED=true
   BILLPLZ_ENV=sandbox
   BILLPLZ_API_KEY=<sandbox secret key>
   BILLPLZ_COLLECTION_ID=<sandbox collection id>
   BILLPLZ_X_SIGNATURE_KEY=<sandbox x signature key>
   # Optional: public URL Billplz can reach (ngrok/cloudflared) when running
   # locally. Defaults to ${NEXT_PUBLIC_URL}/api/webhooks/billplz.
   BILLPLZ_CALLBACK_URL=
   # Optional: origin the customer returns to after paying. Set this to the
   # tunnel origin during local testing when NEXT_PUBLIC_URL points at
   # production. Defaults to NEXT_PUBLIC_URL.
   BILLPLZ_REDIRECT_BASE_URL=
   ```

5. Apply the migration and regenerate the checked-in database types:

   ```bash
   supabase db push          # linked project
   # or apply supabase/migrations/056_billplz_payments.sql manually
   npm run generate-types
   ```

6. Restart the web app. `GET /api/payments/methods` should now include
   `billplz`, and the checkout page shows both payment options.

### Local callbacks need a public URL

Billplz cannot POST to `localhost`. Either:

- set `BILLPLZ_CALLBACK_URL` to a tunnel URL such as
  `https://<tunnel-host>/api/webhooks/billplz`, and keep `NEXT_PUBLIC_URL`
  pointing at the same reachable origin so the redirect works, or
- test the success-page fallback first (it re-reads the bill directly) and add
  the callback URL before relying on webhook-only flows.

The callback URL is also configured per bill at creation time, so the value in
the environment is the source of truth — no dashboard setting is required.

## Production switch

1. Create a production Billplz account and collection.
2. Replace the three credentials with the production values.
3. Set `BILLPLZ_ENV=production` (the client then uses
   `https://www.billplz.com/api/v3`).
4. Keep `BILLPLZ_ENABLED=false` until you are ready to expose the method; the
   checkout hides it while disabled or partially configured.

Never mix sandbox and production credentials — the API will reject them.

## Security properties

- **Server-calculated amount** — the bill amount is `orders.total_cents` from
  the server, never a client-sent price. The webhook and the success-page
  verifier both reject a `paid_amount` that differs from the order total.
- **Signature first, API second** — the callback must pass the X Signature
  check, and its `paid` flag is ignored in favour of a fresh `GET /bills/{id}`.
- **Order binding** — the bill's `reference_1` must equal the order id, and
  `orders.billplz_bill_id` must match when already set. A bill cannot settle a
  different order.
- **Idempotency** — the paid → preparing update is conditional on the status
  read first, and `payments.external_ref` is unique, so callback retries and
  the webhook/verify race cannot double-dispatch a delivery.
- **Fail closed** — a missing X Signature key makes every callback fail
  verification; a partially configured account is not offered at checkout.

## Files

| File | Purpose |
|------|---------|
| `apps/web/src/lib/billplz/client.ts` | API client, config, signature verification |
| `apps/web/src/lib/billplz/payments.ts` | Idempotent `payments` ledger row |
| `apps/web/src/lib/payments/methods.ts` | Shared method ids/labels |
| `apps/web/src/lib/services/order-payment.ts` | Shared paid-order finalisation |
| `apps/web/src/app/api/checkout/create/route.ts` | Creates the bill |
| `apps/web/src/app/api/webhooks/billplz/route.ts` | X Signature callback |
| `apps/web/src/app/api/checkout/verify/route.ts` | Success-page fallback |
| `apps/web/src/app/api/payments/methods/route.ts` | Available methods for the UI |
| `supabase/migrations/056_billplz_payments.sql` | `orders.billplz_bill_id`, payment method |

## Deployment secrets

### Vercel

Add the server-side values under **Project Settings → Environment Variables**
for each environment that should offer Billplz:

| Variable | Production | Preview / Development |
|----------|------------|-----------------------|
| `BILLPLZ_ENABLED` | `true` when ready (otherwise `false`) | `false` unless testing |
| `BILLPLZ_ENV` | `production` | `sandbox` if testing |
| `BILLPLZ_API_KEY` | production Secret Key | sandbox Secret Key |
| `BILLPLZ_COLLECTION_ID` | production collection | sandbox collection |
| `BILLPLZ_X_SIGNATURE_KEY` | production X Signature Key | sandbox X Signature Key |
| `BILLPLZ_CALLBACK_URL` | `https://madkrapow.com/api/webhooks/billplz` (or omit — it defaults to `NEXT_PUBLIC_URL`) | leave unset unless Preview has a stable public URL |

`BILLPLZ_REDIRECT_BASE_URL` is only needed for tunnel-based local testing; leave
it unset in Vercel. Keep `BILLPLZ_ENABLED=false` until the production keys and
callback URL are in place — the checkout hides the method while it is disabled
or partially configured.

### GitHub Actions

The current `ci.yml` builds with `SKIP_ENV_VALIDATION=true` and placeholder
Supabase values, so it does **not** need Billplz secrets. `e2e.yml` also does
not exercise Billplz. Add GitHub secrets only if you extend E2E coverage to
create real sandbox bills; in that case add all three of
`BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, and `BILLPLZ_X_SIGNATURE_KEY`
together (the build fails on a partial configuration), plus
`BILLPLZ_ENABLED=true` and `BILLPLZ_ENV=sandbox`. Do not rely on secrets being
available to pull requests from forks — GitHub withholds them by default.

### Never in client apps

`BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, and `BILLPLZ_X_SIGNATURE_KEY` are
server secrets. Do not add them to `apps/mobile/.env`,
`apps/merchant/.env`, `--dart-define` values, or any `NEXT_PUBLIC_*` variable.
The Flutter apps only need `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`WEB_API_URL`; they read payment state from the database.

## Flutter apps

The merchant and customer apps now show a **Billplz** payment badge and include
Billplz in the merchant sales-report filter, CSV export, payment breakdown, and
order table. Both apps read the new column through a small
`OrdersRowBillplz` extension (`lib/features/orders/data/orders_row_billplz.dart`)
rather than regenerating the full `lib/generated` tree, which would pull in a
large unrelated schema drift. If you later run `supabase_codegen`, the
generated `OrdersRow` will expose `billplzBillId` directly and the extension
becomes redundant.
