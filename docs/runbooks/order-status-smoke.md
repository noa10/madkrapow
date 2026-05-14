# Order Status Smoke Test Runbook

This runbook validates the order-status parity work across the React web app, the Flutter customer app (`apps/mobile`), and the Flutter merchant app (`apps/merchant`). It is referenced by section 7 (V4) of `.omc/plans/order-status-parity-audit.md`.

Run this end-to-end on staging at least once after any change to:

- `packages/madkrapow_orders/order_status.json`
- `apps/web/src/lib/orders/status.ts`
- `apps/web/src/app/api/admin/orders/[id]/status/route.ts`
- The Flutter status stepper / advance / cancel widgets in either app
- Any migration that touches the `orders.status` CHECK constraint

## Pre-flight

1. Confirm `npm run lint:parity` passes on the branch under test.
2. Confirm `flutter test` passes in `apps/mobile` and `apps/merchant`.
3. Confirm `dart test` passes in `packages/madkrapow_orders`.
4. Have three windows open: web admin (`/admin/orders`), customer mobile detail screen, merchant mobile detail screen — all on the same staging order.

## 1. Customer places a delivery order via web

- [ ] Web admin shows the order in the **Preparing** tab (status: `paid`).
- [ ] Customer mobile shows status "Paid"; stepper highlights step 2/6.
- [ ] Merchant mobile shows order in its list; stepper highlights step 2/5.
- [ ] All three platforms show the same total, customer name, delivery address.

## 2. Merchant advances paid → preparing

- [ ] Click "Start Preparing" on web (or "Mark Preparing" on merchant mobile as cashier/admin/manager).
- [ ] Web admin moves the order from `paid` to `preparing` within ≤6 s.
- [ ] Customer mobile updates label to "Preparing"; stepper advances to step 3.
- [ ] Merchant mobile shows "Mark Ready" button next.
- [ ] Telegram/WhatsApp customer (if applicable) receives "✅ being prepared" message.

## 3. Merchant advances preparing → ready

- [ ] Web admin shows status `ready`.
- [ ] Customer mobile shows label "Ready"; stepper at step 4.
- [ ] Merchant mobile shows neither advance button (no manual `ready → picked_up` is allowed; that comes from Lalamove webhook).

## 4. Lalamove webhook fires `picked_up`, then `delivered`

- [ ] Web admin and both mobile apps update to `picked_up` and then `delivered` within ≤6 s of each webhook.
- [ ] Customer mobile shows "On the way" for `picked_up` (delivery type = delivery), then "Delivered".
- [ ] Telegram/WhatsApp receives "🚚 picked up" then "🎉 delivered".
- [ ] Customer mobile and merchant mobile both stop polling once `delivered` is reached (verified by quietness in network logs).

## 5. Cancellation from merchant mobile

- [ ] Place a fresh order, then cancel from merchant mobile (cashier/admin/manager role).
- [ ] Web admin shows the red "Cancelled" banner within ≤6 s.
- [ ] Customer mobile shows the red "Cancelled" status.
- [ ] Telegram/WhatsApp receives the "❌ cancelled" message.
- [ ] Verify kitchen role cannot cancel (button hidden when signed in as kitchen).

## 6. Manual-review dispatch (Lalamove driver-rejection scenario)

- [ ] Force a `manual_review` dispatch state on a staging order via the Lalamove sandbox.
- [ ] Web admin shows the red "Delivery flagged for manual review" banner with retry/cancel guidance.
- [ ] Merchant mobile shows the same banner (admin copy).
- [ ] Customer mobile shows the gentler "We hit a delivery hiccup" read-only banner.

## 7. Bulk approval

- [ ] Place a bulk order (`order_kind = 'bulk'`).
- [ ] Web admin shows the BulkOrderReview block with approve/reject controls.
- [ ] Customer mobile shows the "Your bulk order is being reviewed" banner.
- [ ] Approve via web; customer mobile flips to "approved" with Pay-Now hint; web admin and merchant mobile show the order moving through the regular lifecycle once Stripe webhook lands.
- [ ] Reject via web on a different bulk order; both customer and merchant show the order as `cancelled` with the rejection note.

## 8. Drift guard

- [ ] On the branch under test, edit `packages/madkrapow_orders/order_status.json` to change a status name. Run `npm run lint:parity`. Confirm it exits non-zero with a clear diff message.
- [ ] Revert the edit; confirm `npm run lint:parity` is green again.

## Exit criteria

All checkboxes above pass within a single test pass on staging. If any item fails, file an issue against the ralph branch and do not merge until resolved.
