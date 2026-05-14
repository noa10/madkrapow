# Merchant v0.1.1

_Released 2026-05-14 · Tag `merchant-v0.1.1` · versionCode 1001_

Patch release that brings the merchant app onto the unified order-status model and surfaces the new MK-NNN short code on the staff order screens.

## Highlights

- **MK-NNN display code on staff screens.** Admin order detail and list tiles now show the stable `MK-NNN` code already used by Lalamove driver remarks, so staff and drivers can refer to the same identifier. See `apps/merchant/lib/core/utils/order_code.dart`.
- **Order-status parity across web and Flutter.** Status stepper, advance-status button, and cancel-order controls now share a single status model with the web admin and the customer app, eliminating the previous label and transition drift.

## Commits (app-scoped)

- `4cf5b77` feat(lalamove): show stable MK-NNN display code to drivers (#115)
- `a80242b` feat(orders): enforce order-status parity across web + Flutter apps (#126)

## Upgrade notes

- No action required — in-app updater will prompt.
