# Mad Krapow

Mad Krapow is a direct ordering and restaurant operations system for a Thai street food business in Malaysia. The repository contains a Next.js storefront and back office, Flutter customer and merchant apps, a Supabase database, and integrations for payments, delivery, messaging and sales channels. Availability depends on configuration, provider credentials and the database schema installed in the target environment.

## Ordering for customers

- Browse and search the menu, customize dishes with available modifiers, and manage a cart. The web storefront supports delivery or self-pickup, ASAP or scheduled orders, and promo codes. Standard checkout requires a signed-in customer with a verified email.
- Pay through Stripe card checkout or Billplz online banking when the corresponding provider is configured and enabled. Order history and tracking show order progress; delivery details and a driver map are shown when available.
- Submit a bulk order for merchant review when bulk ordering is enabled. The approved order screen contains a **Pay Now** link, but the current link goes to the success page rather than starting a payment; completing payment for approved bulk orders needs further work.
- Scan a restaurant table QR code to order without signing in. Diners can choose to pay at the counter or use the displayed DuitNow QR and claim payment. That claim does **not** verify the bank transfer: staff must check it.
- Telegram and WhatsApp bot handlers provide menu, cart, address and checkout conversations when configured and enabled. See [conversation flows](docs/bot-conversation-flows.md), the [bot API reference](docs/bot-api-reference.md), and the [bot deployment guide](docs/bot-deployment.md).

## Merchant and restaurant operations

The web back office and merchant app provide order lists and kitchen views, status actions, menu and modifier management, promotions, staff management, analytics and reports, subject to staff role permissions. The POS supports dine-in and takeaway sales with cash or company QR payment, table management, and settlement of unpaid table orders. Card terminal payment is not implemented in the POS. Merchant app order notifications use Firebase and a Supabase worker when configured; see the [notification worker setup](supabase/functions/notify-admin/README.md).

GrabFood integration includes order ingestion and lifecycle handling, menu mapping and availability controls, and reconciliation routes. It requires partner configuration; mock mode is available for development. See the [GrabFood integration guide](docs/grabfood-integration.md). The optional [print bridge](scripts/print-bridge/README.md) runs on the restaurant network and sends ESC/POS jobs to a thermal printer; its guide describes retry and manual reprint limitations.

## Delivery and payment operations

Delivery checkout obtains a Lalamove quote. Payment finalization attempts to book ASAP delivery; scheduled deliveries are queued for the scheduled dispatch endpoint, which needs an appropriately configured scheduler. Booking failures require operator attention. Customer tracking can show delivery status, driver information and a provider link when supplied. Lalamove and payment providers, webhooks, store settings and any scheduler must be configured for these flows to work.

## Applications and platforms

| Path | Purpose |
| --- | --- |
| [`apps/web`](apps/web) | Next.js storefront, table ordering, POS, back office and API routes |
| [`apps/mobile`](apps/mobile) | Flutter customer app: menu, cart, checkout, orders and profile |
| [`apps/merchant`](apps/merchant) | Flutter staff app: kitchen, orders, POS, menu and management tools |
| [`packages`](packages) | Shared TypeScript and Dart packages, including order status definitions |
| [`supabase`](supabase) | Database migrations, seed data and Edge Functions |
| [`scripts`](scripts) | Operational utilities, including the LAN print bridge |

Both Flutter apps contain Android and iOS projects. The customer app also has desktop and web platform scaffolding. The repository's Android CI builds debug APKs; the presence of other platform projects alone does not establish release readiness. Android tag-based releases and signing configuration are described in the [Android release guide](docs/android-release.md).

## Developer setup

The repository uses npm workspaces for the web app and shared TypeScript package. CI uses Node.js 22 for the main web checks. Flutter CI uses Flutter 3.41.9 and Java 17 for Android builds.

1. Install Node.js and npm, then install the locked workspace dependencies from the repository root:

   ```bash
   npm ci
   ```

2. Create `apps/web/.env.local` using the root [`.env.example`](.env.example) as the core reference and [`apps/web/.env.example`](apps/web/.env.example) for additional web and bot settings. Replace placeholders with values for your own environment. Keep service-role keys, provider secrets and webhook secrets server-side and out of version control. Some comments in the root example refer to web example files that are not present in this checkout.
3. Configure Supabase and the integrations needed for your work. The local Supabase configuration and migrations are in [`supabase`](supabase). Use test or sandbox credentials where applicable; do not apply migrations blindly to an existing remote database. The web build's [`scripts/validate-env.js`](scripts/validate-env.js) requires Supabase, Stripe, Lalamove, Google Maps, Resend and store settings even when a corresponding integration is disabled. Partially configured Billplz credentials also fail validation unless Billplz is disabled. See the [Billplz guide](docs/billplz-integration.md) for its setup.
4. Start the web app from the repository root:

   ```bash
   npm run dev
   ```

   The development server uses `http://localhost:3000`. Provider callbacks and scheduled dispatch need reachable endpoints and their own configuration; starting the server alone does not enable them.

For either Flutter app, install Flutter and Android/iOS platform tooling as appropriate. In `apps/mobile` or `apps/merchant`, copy that app's `.env.example` to `.env`, replace its placeholders, and set `WEB_API_URL` to the intended web API. The examples default to a production URL; for a local API the Android emulator uses `http://10.0.2.2:3000`, the iOS simulator can use `http://localhost:3000`, and physical devices need a reachable LAN address. Then run:

```bash
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter run
```

The Flutter apps generate configuration from `.env`; the root example's `--dart-define` comment does not describe this configuration path. Google sign-in requires additional provider setup; see [Google sign-in setup](docs/google-sign-in-setup.md). Merchant push notifications also require Firebase configuration; see the [Android release guide](docs/android-release.md) and [worker setup](supabase/functions/notify-admin/README.md).

## Checks

From the repository root, the scripts defined in [`package.json`](package.json) include:

```bash
npm run lint
npm run typecheck
npm run lint:parity
npm test
npm run test:e2e
npm run build
```

`lint:parity` checks the order status definitions across SQL, TypeScript and Dart. Playwright's E2E configuration uses Chromium and starts the web development server; it needs its browser dependencies and the relevant app environment. Flutter checks can be run in each app with `flutter analyze` and `flutter test`. Integration and end-to-end flows may require configured external services and test data.

Additional context is available in the [architecture documentation](docs/architecture.md), [order status specification](docs/order-status-spec.md), and [Dependabot documentation](https://docs.github.com/en/code-security/dependabot).
