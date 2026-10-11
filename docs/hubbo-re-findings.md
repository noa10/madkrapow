# Hubbo POS — Reverse-Engineering Findings

Source: static + dynamic analysis of `HUBBO POS.apk` (Flutter, Dart 3.5.1, package
`com.nexstream.aliment.peaberry`, v6.12.3) at `/Users/khairulanwar/dev/hubbo/`.
Evidence lives in that repo: `BACKEND_API_INTEGRATION.md`, `HTTP_AUTH_ANALYSIS.md`,
`LIVE_CAPTURE.md` (Frida runbook), `capture.js`, and blutter output under
`_re/blutter-out/` (`pp.txt` string pool + per-package Dart disassembly).

Purpose of this document: record what the Hubbo POS actually does so MadKrapow can
adopt the patterns that matter (GrabFood menu/availability handling, thermal
printing) and assess the interim "pull via Hubbo" path before official GrabFood
Partner API onboarding.

**Last updated**: 2026-10-11

---

## 1. Headline finding: Hubbo has NO GrabFood credentials

The app contains zero GrabFood URLs, tokens or HMAC code (complete string-pool
inventory: only `api.aliments.my`, `mini.hubbopos.com`, `qr.aliments.my`,
`cb.aliments.my`, `inv.aliments.my`). All GrabFood connectivity is mediated by
Hubbo's own backend ("alimentsBackend"):

- Orders arrive from the backend tagged `partner=GRAB_FOOD` with device/source
  name **"GRABFOOD ROBOT"** (also `FOODPANDA ROBOT`, `SHOPEEFOOD ROBOT`,
  `GOFOOD_ROBOT`) — automated order-forwarding workers on the Hubbo backend.
- Delivery is cron poll (`ORDER_CRON_JOB` timer in `native_bridge.dart`) plus
  OneSignal push with `forceFetchOrder` — the app never receives webhooks.
- Menu/availability propagation to Grab is likewise backend-side: the POS only
  reads `GET /api/merchant/menu`, writes `POST /api/merchant/snoozeMenu`, and
  stores per-channel prices (`grabfoodPrice`, `foodpandaPrice`, …) that the
  backend consumes.
- The binary shows Grab itself was involved in building the app (build path
  `grab_repos/aliments-pos`, Jira `BP-2419`, `com.grab.scribe` SDK) — Hubbo is a
  Grab-partnered POS, not a scraper. The Grab Merchant App remains in the
  operational loop (business-hours banner, reject reasons 1001–1004).

**Implication**: there is no GrabFood session to proxy. The reproducible interim
path is to authenticate to `https://api.aliments.my/alimentsBackend` the way the
app does and call the merchant endpoints below. That backend mediates GrabFood
with Hubbo-the-vendor's credentials.

## 2. Hubbo backend auth scheme (alimentsBackend)

1. `POST /api/merchant/login` with `{"androidId": <SSAID>, "deviceId": <vendor/serial>}`.
2. Response `body.apiKey` (device-bound session token).
3. Every request sends header `apiKey: <key>` plus `X-Request-Id: <uuid v4>`.
4. On `"api.key.invalid"` the app silently re-logins and retries. HTTP 429 is
   handled explicitly. Error envelope: `{code, message, body, errCode, reason}`
   with string `"code == "200""` for success; other markers:
   `api.invalid.android.id`, `api.uuid.duplicate`, `duplicate.call.try.again.later`.
5. No TLS pinning observed; the `apiKey` is replayable if captured.

Capturing a live key: `LIVE_CAPTURE.md` + `capture.js` hook `LoginRequest.toApiJson`
and `PosHttp._getHttpHeaders` on the real device. Device-ID provisioning must be
accepted by the backend; unknown hardware falls back to a serial-number path
(`BACKEND_API_INTEGRATION.md` §3.3).

**Caveats for MadKrapow use**: unofficial (ToS-gray), device-ID validation may
reject logins from non-registered hardware, and the backend can change without
notice. Use is env-gated and default-off (`lib/hubbo-merchant/`).

## 3. Hubbo merchant endpoint catalog (recovered from the app)

All under `https://api.aliments.my/alimentsBackend` (dev: `dev.api.aliments.my`):

```
POST /api/merchant/login                    GET  /api/merchant/status
GET  /api/merchant/menu                     POST /api/merchant/snoozeMenu
POST /api/merchant/order                    POST /api/merchant/order/create|update|cancel|void|sync|addItems
     /api/merchant/orderWithComplete             /api/merchant/ordersWithComplete
     /api/merchant/updateComplete/<id>           /api/merchant/removeEmptyTicket/<id>
GET  /api/merchant/latestInvoiceNumber      POST /api/merchant/dahMakanOrder (QR self-ordering)
POST /api/merchant/selfOrderingAndItemSold  POST /api/merchant/void | voidItems/insert | void/request | void/list
POST /api/merchant/pause                    POST /api/merchant/shift | shift/close | shift/report | shift/receipt
POST /api/merchant/totalShiftReport         GET  /api/merchant/payAtCounter/paymentMethod
POST /api/merchant/coupon/validate          POST /api/merchant/submitEWalletPayment
GET  /api/merchant/qris/client-auth         POST /api/merchant/settings | posSettings | cardSettings
POST /api/merchant/printer | updateReceiptPrinter | versionCheck | ping
POST /api/merchant/staffs/attendance        POST /api/merchant/customer
POST /api/merchant/updatePushIds | testPush POST /api/customer/hasTicket
POST /api/merchant/businessIntelligence     POST /api/merchant/backup/merchant-logs
```

Menu model keys (per item): `id, name, desc, shortDesc, image, price,
priceInTwoDecimal, grabfoodPrice, foodpandaPrice, gofoodPrice, shopeeFoodPrice,
docketName, printerId, printerId2, sku, snoozeTill, maxOrder, stockProducts,
subCategories, subItems, addOns, combo, type ("NORMAL_ITEM"), allowDiscount,
remarks, packagingFee, sstOverride, serviceChargeOverride`. AddOns carry the same
channel prices + `singleSelect, maxOrder, sku, snoozeTill`.

Snooze payload (`models/snooze_menu_item.dart`):
`SnoozeMenuItem{ menuId, snoozeTill (epoch), menuAddOnId, sku, categoryId }` —
`snoozeTill` is the time-based sold-out mechanism; `sku` is the external-channel
mapping key.

GrabFood order conventions: order IDs prefixed `"GF-"`; per-order fields
`partner, partnerShortOrderId, delivery (driverName, driverPlateNumber,
driverContact, trackingUrl), pickUpTime, pickupNo`; reject reasons
`{"1001": "Items are unavailable", "1002": "I have too many orders now",
"1003": "My shop is closed", "1004": "My shop is closing soon"}`.

## 4. Printing architecture (blueprint for MadKrapow)

Two layers:

**Dart print pipeline**
- `services/printer/esc_printable_generator.dart` — ESC/POS byte generator;
  paper widths map to **32, 42 or 48 chars per line** (58 mm / 80 mm).
- Print jobs (`features/printing/print_job/`): kitchen_docket, invoice,
  bill_summary, order_summary, shift_report, void_receipt, cash_in_out,
  change_table, dynamic_qr — each an "args → renderable lines" builder, with
  reprint/cancelled watermarks and a Hive-backed already-printed dedup.
- Kitchen routing: menu items carry `docketName` + `printerId`/`printerId2`;
  dockets route per item/group; websocket master→client printing for KDS.

**Printer transports** (`worker/printer_connection.dart`): Network TCP ESC/POS
(`esc_pos_printer`), Bluetooth, USB, Sunmi and iMin built-in printers; native
Android side bundles `com.dantsu.escposprinter` (open-source ESC/POS) plus
vendor SDKs. Manufacturer list: BIXOLON, GPRINTER, STAR, GENERIC, KDS, EPSON,
SUNMI. Network discovery via mDNS/NSD. Printer settings include `port`,
`characterPerLine`, `is58mmPaper`, `cashDrawerChannal` (drawer kick via printer),
beep-on-print, label sizes.

**Adopted for MadKrapow** (`lib/printing/` + `scripts/print-bridge/`): pure-TS
ESC/POS byte generator (32/42/48 columns), job builders from canonical order
data, and a Node print bridge on the restaurant LAN (Vercel serverless cannot
reach a LAN printer; browsers cannot open raw TCP) that subscribes to Supabase
Realtime for auto-print and accepts localhost HTTP reprints from the POS pages.

## 5. Other Hubbo features worth borrowing later

| Feature | Hubbo evidence | MadKrapow status |
|---|---|---|
| Shift / Z-report (opening/closing cash, expected vs counted, drawer txns) | `models/shift.dart`, `shift/close`, `totalShiftReport`, printed Z-report | Deferred — counter POS cash sessions |
| Store pause | `POST /api/merchant/pause` | Added (GrabFood `PUT /partner/v1/merchant/pause`) |
| Order accept/reject + cancelable check | Grab reject reasons 1001–1004 | Added (gap #1 closed) |
| Packaging fee / SST / service-charge overrides | `packagingFee`, `sstOverride`, `serviceChargeOverride` | Future revenue-calc refinement |
| Stock limits + low-stock push | `maxOrder`, `stockProducts`, OneSignal `/lowStock` | Future |
| Cash drawer kick via printer | `cashDrawerChannal` | With shift feature |
| Malaysia e-invoice flow | `MALAYSIA_E_INVOICE`, `models/my_e_invoice.dart` | Out of scope |
| Multi-terminal websocket + Firestore ticket sync | `web_socket_service_2.dart` | Out of scope |

## 6. Relation to the existing `lib/hubbopos/` integration

The older `lib/hubbopos/` integration targets `developer.hubbopos.com` with
OAuth2 (`mexpos.partner_api`) per public docs — `docs/hubbopos-mapping.md` is
marked DRAFT awaiting partner-API confirmation. This analysis shows the shipping
app uses the alimentsBackend `apiKey` scheme instead, so that draft's auth model
should be treated as unconfirmed. The new `lib/hubbo-merchant/` adapter is a
separate, RE-based client; the existing hubbopos code stays untouched.
