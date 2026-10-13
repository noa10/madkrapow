# Hubbo Merchant Menu Pull — Test Runbook (dry-run first)

Validates the UNOFFICIAL Hubbo merchant menu pull (`alimentsBackend` API)
implemented on branch `feat/grabfood-menu-printing`. Run the dry-run paths in
order — the automated route test proves the plumbing, the mock-server path
proves the full chain end-to-end, and the live capture proves it against the
real backend. All of them are **read-only** (dry-run writes nothing).

Key files:
- Route: `apps/web/src/app/api/admin/hubbopos-merchant/menu/pull/route.ts`
- Client: `apps/web/src/lib/hubbo-merchant/client.ts` (+ `auth.ts`, `menu.ts`)
- RE findings: `docs/hubbo-re-findings.md`
- Capture tooling: `/Users/khairulanwar/dev/hubbo/live-capture.sh`

Auth for the route: an authenticated **admin or manager** session (cookie). The
adapter is **env-gated, default OFF** (`HUBBO_MERCHANT_ENABLED=false`).

---

## 0. Automated route test (always — proves the plumbing)

Covers the env gate (409), auth (401), body validation (400), the 502 error
path, and the happy dry-run through the **real** `HubboMerchantClient` +
real `fetch` against a local mock `alimentsBackend` (flat-envelope unwrap → map
→ JSON, zero DB writes). No credentials, no network, no emulator.

`lib/hubbo-merchant/__tests__/menu.test.ts` maps the **real captured payload**
(`__tests__/fixtures/live-menu-response.json`) so the wire format stays pinned
to reality — this is what caught the original 100× price bug and the wrong
`envelope.body` assumption. `scripts/__tests__/mock-aliments.test.mjs` pins the
standalone harness below to the same format.

```sh
cd /Users/khairulanwar/dev/madkrapow
npx vitest run \
  apps/web/src/app/api/admin/hubbopos-merchant/menu/pull/__tests__/route.test.ts \
  apps/web/src/lib/hubbo-merchant \
  scripts/__tests__/mock-aliments.test.mjs
npm run typecheck
```

Expected: `19 passed`, typecheck clean.

---

## 1. Local mock backend (full chain, no credentials)

The real client only needs a configured credential + a base URL — it does **not**
read `HUBBO_MERCHANT_ENABLED`. So point it at a local fake server and any dummy
key to exercise the whole route over real HTTP.

### 1a. Start the mock server

```sh
# from the repo root — serves GET /api/merchant/menu with the real envelope
node scripts/mock-aliments.mjs
# prints: mock alimentsBackend listening on http://127.0.0.1:8787
```

The harness serves the menu as a **flat envelope** (`menu[]`/`categories[]` at
the top level, never under `body`), with numeric ids, RM-decimal prices and
`subCategories[0].id` linkage — the same shape as the captured fixture. Only
`/api/merchant/login` is `body`-wrapped (that one genuinely is).

### 1b. Enable the adapter in `apps/web/.env.local`

```env
HUBBO_MERCHANT_ENABLED=true
HUBBO_MERCHANT_BASE_URL=http://127.0.0.1:8787
HUBBO_MERCHANT_API_KEY=dummy-not-a-real-key
```

`validate-env` must still pass:

```sh
cd apps/web && node ../../scripts/validate-env.js
```

### 1c. Start the app and call the route as an admin/manager

```sh
npm run dev   # from repo root (or apps/web per your setup)
```

From a logged-in admin session (browser devtools / cookie), or with the session
cookie via curl:

```sh
curl -s -X POST http://localhost:3000/api/admin/hubbopos-merchant/menu/pull \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <admin-session-cookie>' \
  -d '{"dryRun":true}'
```

Expect `200` with `ok:true, dryRun:true, categoriesUpserted:0, itemsUpserted:0`
and any `warnings` from the mock menu. **No rows are written.** Confirm
`scripts/mock-aliments.mjs` logged the `apiKey` header it received.

> When done, set `HUBBO_MERCHANT_ENABLED=false` again so the adapter stays off.

---

## 2. Live capture → real dry-run (real backend)

Uses Frida + the `Medium_Phone` arm64 emulator to capture the real `apiKey`
issued to the device, then runs the same dry-run against `api.aliments.my`.

### 2a. Capture the apiKey (one-time per device)

Tooling is ready in `/Users/khairulanwar/dev/hubbo`. Prerequisites verified:
`frida 17.23.1`, the emulator, and AVD `Medium_Phone`. Only the matching
**frida-server** binary is missing — download it once:

```sh
# from https://github.com/frida/frida/releases -> frida-server-<ver>-android-arm64.xz
xz -d ~/Downloads/frida-server-17.23.1-android-arm64.xz

cd /Users/khairulanwar/dev/hubbo
export FRIDA_SERVER=~/Downloads/frida-server-17.23.1-android-arm64
./live-capture.sh emulator   # boot Medium_Phone
./live-capture.sh install    # adb install -r 'HUBBO POS.apk'
./live-capture.sh frida      # push + start frida-server on device
./live-capture.sh capture    # attach capture.js; >>> NOW PERFORM LOGIN <<<
```

`capture.js` prints the login response `body.apiKey` (hook:
`LoginResponse.fromJsonString @ 0x8342ec`). Copy it — it is a **credential**.

> Reference: `/Users/khairulanwar/dev/hubbo/LIVE_CAPTURE.md`. The `apiKey` is a
> runtime secret tied to this device — treat the capture output as sensitive and
> never commit it.

### 2b. Configure + dry-run against the real backend

In `apps/web/.env.local` (use the real base URL, or omit it — the client
defaults to `https://api.aliments.my/alimentsBackend`):

```env
HUBBO_MERCHANT_ENABLED=true
# HUBBO_MERCHANT_BASE_URL=https://api.aliments.my/alimentsBackend   # default
HUBBO_MERCHANT_API_KEY=<captured-apiKey>
```

Restart `npm run dev`, then call the route exactly as in §1c. Expect `200` with
the **real** menu mapped into a dry-run plan. Sanity-check the first live pull:

- item/category counts look plausible for the merchant;
- prices look like integer **sen** (RM 14.50 → `1450`; a 100× value is the bug);
- snoozed items show `isAvailable:false`;
- items with `grabfoodPrice > 0` carry `grabfoodPriceCents`; `0.0` maps to `null`.

> **Price assumption — CONFIRMED** on the 2026-10-13 live capture: `price` and
> `grabfoodPrice` are **RM decimals** (`14.5` = RM 14.50), multiplied by 100 in
> `priceToCents` to give integer sen. `priceInTwoDecimal` ("3.50") is the string
> fallback, and `grabfoodPrice: 0.0` means "not sold on GrabFood" → `null`. The
> full live payload is committed at
> `apps/web/src/lib/hubbo-merchant/__tests__/fixtures/live-menu-response.json`
> and mapped by `menu.test.ts`, so a regression is caught by §0.

> Reset `HUBBO_MERCHANT_ENABLED=false` and remove the captured `apiKey` when
> done. Rotate/re-capture if the key is ever exposed.

---

## Pass criteria

- §0 automated test: green (`19 passed`); typecheck clean.
- §1 mock: route returns the mapped dry-run plan over real HTTP; the mock
  received the `apiKey` header; nothing written.
- §2 live: route returns the real menu mapped correctly; price units confirmed
  (RM decimals × 100 → sen); adapter reset to OFF afterwards.
