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

## Cutover order

1. **Billplz first.** Create the production account and collection, complete
   KYC, then set the production Billplz values above. Keep
   `STRIPE_ENABLED=false` so the broken card option disappears immediately.
2. **Deploy and verify the method list.**
   ```bash
   curl -s https://www.madkrapow.com/api/payments/methods
   ```
   Expected while Stripe is off: only `billplz`. If Billplz is missing, read the
   server log for `[API] Billplz unavailable:` and fix the named condition.
3. **Take one small live FPX payment.** Confirm the Billplz callback reaches
   `/api/webhooks/billplz`, the order moves to `preparing`, and the payment row
   uses the production bill URL.
4. **Activate Stripe.** Complete the Stripe account activation, create a live
   webhook endpoint at `https://www.madkrapow.com/api/webhooks/stripe` for
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and
   `checkout.session.async_payment_failed`, then copy its `whsec_…`.
5. **Switch Stripe on.** Set the live `sk_live_…`, `pk_live_…`, the live webhook
   secret, and `STRIPE_ENABLED=true`. Redeploy.
6. **Verify and take one small card payment.** The methods endpoint should list
   both gateways, and the order should advance to `preparing` through the live
   webhook.

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
