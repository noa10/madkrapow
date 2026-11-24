# Payment production cutover

This is the operator checklist for moving MadKrapow's checkout from sandbox
credentials to live Stripe and Billplz. The application enforces the same rules
at runtime, so a half-switched deployment hides the affected method instead of
showing a payment button that cannot take money.

## What the code now enforces

### Stripe

`STRIPE_ENABLED` defaults to `true`. A Stripe method is offered only when all of
the following are true:

- `STRIPE_ENABLED` is not `false`.
- `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are both present.
- Both keys have the same mode: `sk_test_` + `pk_test_`, or `sk_live_` + `pk_live_`.
- `STRIPE_WEBHOOK_SECRET` is present.
- On a production deployment, the pair is live.
- Outside production, the pair is test. Live keys in Preview or Development are
  rejected so a preview cannot charge a real card.

If any rule fails, `/api/payments/methods` omits Stripe, and
`/api/checkout/create`, the bot checkout, and bulk-order approval return `503`
before creating a payment session. The reason is logged server-side without
printing key values.

### Billplz

A Billplz method is offered only when:

- `BILLPLZ_ENABLED` is not `false`.
- `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, and `BILLPLZ_X_SIGNATURE_KEY` are
  all present.
- The resolved API URL matches `BILLPLZ_ENV`: production uses
  `https://www.billplz.com/api/v3`; sandbox uses
  `https://www.billplz-sandbox.com/api/v3`.

A sandbox URL with `BILLPLZ_ENV=production`, or the reverse, hides the method and
returns `503` at checkout. `BILLPLZ_BASE_URL` should be left unset in Vercel.

## Production environment

Set these in **Vercel → Project → Settings → Environment Variables →
Production**. Never put live secrets in chat, source control, or a `NEXT_PUBLIC_*`
variable.

| Variable | Production value |
|---|---|
| `NEXT_PUBLIC_URL` | `https://www.madkrapow.com` |
| `STRIPE_ENABLED` | `false` until live Stripe keys are in place; then `true` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | live `pk_live_…` |
| `STRIPE_SECRET_KEY` | live `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | signing secret from the **live** webhook endpoint |
| `BILLPLZ_ENABLED` | `true` |
| `BILLPLZ_ENV` | `production` |
| `BILLPLZ_API_KEY` | production Secret Key |
| `BILLPLZ_COLLECTION_ID` | production collection ID |
| `BILLPLZ_X_SIGNATURE_KEY` | production X Signature Key |
| `BILLPLZ_CALLBACK_URL` | leave unset; it defaults to `${NEXT_PUBLIC_URL}/api/webhooks/billplz` |

`NEXT_PUBLIC_URL` and every `NEXT_PUBLIC_*` value are baked at build time.
Changing them requires a new deployment, not just a restart.

## Before deploying the payment-integrity fixes

The webhook now refuses to finalise a session whose id is not stored on the
order. Older code could return a payment URL even when saving that id failed, so
check for orders that were left pending without a reference before you deploy:

```sql
select id, order_number, status, created_at
from public.orders
where status = 'pending' and stripe_session_id is null;
```

Reconcile any row against the Stripe Dashboard by `metadata.order_id` before the
deploy. A paid session found this way must be finalised or refunded by hand;
after the deploy the webhook will keep returning `500` for it so it is retried
rather than silently ignored.

## Cutover order

1. **Check channel availability before changing either gateway.** Mobile and bot
   checkout use Stripe; switching Stripe off makes card checkout unavailable in
   those channels. Coordinate any temporary interruption with the operator.
2. **Activate Stripe.** Complete account activation and any required business
   verification in the Stripe Dashboard. Create a live webhook endpoint at
   `https://www.madkrapow.com/api/webhooks/stripe` for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and
   `checkout.session.async_payment_failed`. Copy its signing secret directly to
   Vercel; do not share it in chat.
3. **Configure and deploy.** Set the live `sk_live_…`, `pk_live_…`, the live
   endpoint's signing secret, and `STRIPE_ENABLED=true` in Vercel Production.
   Deploy the reviewed, tested changes. Coordinate the change and the live test
   with the operator.
4. **Check the method list.**
   ```bash
   curl -s https://www.madkrapow.com/api/payments/methods
   ```
   Stripe should appear. This confirms the configuration guard passes; it does
   not prove the credentials work, the account can accept payments, or webhook
   events are delivered.
5. **Verify one small live card payment.** With the operator's approval, place a
   pickup order with a known amount. Confirm the live Stripe payment and
   successful webhook delivery in the Stripe Dashboard, and confirm the matching
   order amount, payment and order status in the application. Refund the test
   payment and check the refund in Stripe. Record the result without exposing
   card details or secrets.
6. **Verify Billplz separately.** Complete its production account and collection
   setup and KYC, configure the Billplz values above, and verify its method is
   listed. With the operator's approval, take a small live FPX payment and confirm
   its callback, order and payment record; arrange any refund through the
   appropriate Billplz process. Stripe and Billplz can be checked independently.

For delivery orders, a paid or `preparing` order does not by itself prove that a
rider was booked. If dispatch fails or its outcome is uncertain, check both the
application and Lalamove before arranging another rider. Do not blindly retry an
ambiguous booking: the first request may have succeeded even when its response
or local record was lost.

## Rollback

- To stop card payments immediately, set `STRIPE_ENABLED=false` and redeploy.
- To stop FPX, set `BILLPLZ_ENABLED=false` and redeploy.
- Do not “fix” a failing method by mixing a live secret with a test publishable
  key or by pointing production at the sandbox URL. The guard will hide it, and
  the mismatch is the exact failure this change is meant to prevent.

## Why this exists

Before this guard, production had `sk_test_…` paired with `pk_live_…`, so the
card button was visible but every checkout session was a test session. The
publishable key was live, so the mismatch was invisible to the customer. These
checks make that state impossible to ship silently.
