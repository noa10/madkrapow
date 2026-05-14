# Mobile v0.1.1

_Released 2026-05-14 · Tag `mobile-v0.1.1` · versionCode 1001_

Patch release focused on order-status parity with the web app, the new MK-NNN customer-facing display code, and a checkout reliability fix.

## Highlights

- **Stable MK-NNN order code in the customer app.** Order success, history, and detail screens now show the same `MK-NNN` short code that drivers and staff already see, replacing the long UUID. See `apps/mobile/lib/core/utils/order_code.dart`.
- **Order-status parity across web and Flutter.** The mobile order timeline, advance/cancel controls, and status stepper now share a single source of truth with the web admin and customer views, so transitions and labels match everywhere.

## Fixes

- Tapping the system back button on the Stripe checkout WebView no longer crashes the app (`7d67e53`).

## Commits (app-scoped)

- `3a8eb0a` feat(mobile): show stable MK-NNN display code in customer app (#120)
- `a80242b` feat(orders): enforce order-status parity across web + Flutter apps (#126)
- `7d67e53` fix(mobile): prevent crash on Stripe checkout back button (#128)

## Upgrade notes

- No action required — in-app updater will prompt.
