# Merchant order notification backend

The canonical migrations `20261105184927_merchant_notifications_registration.sql` and `20261105185040_merchant_notifications_outbox.sql` and the `notify-admin` Edge Function replace the former direct-order-payload sender. They were merged with the atomic order RPCs in PR #510. Nothing in this directory deploys itself.

## SQL and Flutter contract

Flutter registers or refreshes an installation using its signed-in Supabase client:

```dart
await supabase.rpc('register_merchant_fcm_token', params: {
  'p_device_id': installationId,
  'p_token': fcmToken,
  'p_platform': Platform.isIOS ? 'ios' : 'android',
});
```

The exact RPC is `public.register_merchant_fcm_token(p_device_id text, p_token text, p_platform text) RETURNS void`. Only `authenticated` may execute it. It checks current `auth.users.raw_app_meta_data.role`, bans/deletion, and an active employee with the same role. Allowed roles are `admin`, `manager`, `cashier`, and `kitchen`; a stale JWT role is insufficient. An admin without an employee row also needs the explicit owner allowlist described below. If an employee row exists and is inactive, the owner allowlist does not override that deactivation.

`device_id` is a persistent random installation capability: the existing Flutter 16 secure random bytes encoded as unpadded base64url satisfy validation (22–128 ASCII base64url characters). Preserve it across sign-out/account switches, and do not expose or log it. This is possession of an installation capability, not hardware attestation. FCM tokens must contain 10–2048 ASCII letters, digits, colon, underscore, dot or hyphen; platform is `android` or `ios`.

Registration serializes the following operations in one transaction:

1. Remove any different installation row containing the supplied FCM token.
2. Insert or update the globally unique device registration, transferring `user_id` on account switch and replacing the token/platform.
3. Rotate an opaque `registration_version`, used to protect refreshed registrations from stale FCM failures.

It returns no token, row ID or prior ownership information. Call it again on token refresh. The registration migration requires existing device IDs and tokens to be unique; check and reconcile historical duplicates before applying it to an existing database. Active authorized staff may select/delete only their own `fcm_tokens` rows; direct client INSERT/UPDATE is revoked. Existing authenticated sign-out deletion by `user_id` and `device_id` continues to work and should run before auth sign-out. Deactivated/banned users are denied token access and excluded from delivery even if deletion could not run. After a direct account switch, the old JWT cannot delete the new owner's row.

An operator must explicitly provision each admin owner that has no employee record, after checking the Auth user UUID and app metadata. Run with a privileged SQL connection; substitute the verified UUID:

```sql
INSERT INTO public.merchant_notification_owners(user_id)
SELECT id FROM auth.users
WHERE id = '<VERIFIED_OWNER_AUTH_USER_UUID>'::uuid
  AND raw_app_meta_data->>'role' = 'admin'
  AND deleted_at IS NULL
  AND (banned_until IS NULL OR banned_until <= now())
ON CONFLICT DO NOTHING;
```

There is no automatic owner inference from a missing employee record. Deleting the allowlist row revokes that exception. No client may read or edit this table.

## Source events and transaction boundary

Outbox rows have `UNIQUE(order_id,event_type)` with normalized `event_type='new_order'`. `source_event_type` preserves the triggering marker; `source_event_id` preserves the audit event UUID when present. Notification `data.event_id` is the outbox UUID, stable across every delivery attempt.

The `AFTER INSERT ON order_events` trigger accepts only service-role source writes, and only:

| Audit marker | Additional filter |
| --- | --- |
| `table_order_placed` | `source='web'`, `delivery_type='dine_in'` |
| `bulk_submitted` | `order_kind='bulk'` |
| `grabfood_received` | `source='grabfood'` |
| `created` | `source='counter'` |

The order must still be pending, paid, accepted or preparing. The source and outbox insertion commit or roll back together. Existing broad staff policies permit direct order-event writes; those client writes deliberately cannot enqueue notifications. Migration 072 already writes the counter marker atomically. The independently implemented QR/bulk atomic writers must write their markers with service-role authority as part of the same transaction as the header, lines and modifiers. Before that rollout, a failure between the legacy route's order and event requests remains an upstream gap.

Known limits in the same rollout: bulk submission has no idempotency key, so an HTTP retry after a lost response can create a second pending bulk order (the legacy route had the same behavior); the table-QR 4-per-5-minutes limit counts committed orders, so failed attempts do not consume it; and only the four `source`/`event_type` combinations in the table above alert — a future `source='mobile'` or `'foodpanda'` writer must be added here explicitly.

A separate `AFTER UPDATE OF status ON orders` trigger handles `pending -> paid` and `pending -> preparing` for standard `web`, `telegram`, or `whatsapp` delivery/self-pickup orders. It permits payment-service writes and current authorized admin/manager JWTs for manual mark-paid. It does not require a payment ledger row because the current manual-paid path does not write one. Source, delivery type, order kind and creation time must remain unchanged. Pending checkouts, inserts already in a paid state, QR settlements, bulk approvals, imported audit markers, GrabFood edits and later kitchen transitions do not enqueue.

The protected configuration row records activation time. Orders and audit markers dated before migration activation are excluded: this deliberately prevents historical replay, including a formerly pending order that only gets paid after installation. There is no historical backfill. A historical import that deliberately forges a fresh timestamp plus a live marker is indistinguishable from a new source event; importers must retain their historical timestamp/import marker. Existing public order-write authorization is outside this backend change.

No HTTP, OAuth, FCM or other external request occurs in an order/payment transaction.

## Delivery and retry semantics

`merchant_notification_outbox` and `merchant_notification_deliveries` have RLS and no anon/authenticated access. The service-role-only RPCs are:

- `claim_merchant_notification()` returns at most one eligible recipient and its token, random lease, order/event IDs and device metadata. Each call advances at most ten outbox events, scanning at most 100 registrations per event using a persisted cursor. Registrations created after fan-out begins do not join that event. Eligibility is checked during fan-out and again just before the individual delivery claim.
- `complete_merchant_notification(p_delivery_id uuid,p_lease_id uuid,p_outcome text)` returns a boolean; outcomes are `sent`, `retry`, or `unregistered`. A mismatched or expired lease cannot acknowledge or delete anything.

Claims use `FOR UPDATE SKIP LOCKED`, a two-minute lease and a fresh random fencing UUID. Crashed claims become available after lease expiry. Recipients with persisted `sent` state are never retried. Signed-out, reassigned, banned, deleted or deactivated recipients are skipped. Retries begin at 30 seconds and double, capped at one hour, with a maximum of eight claims per recipient; exhausted claims become `failed`. A token refresh preserves the registration row and successful delivery history. A confirmed `UNREGISTERED` response only deletes the same registration version that was actually sent. If it refreshed during the send, the new version is retained and retried within the attempt budget.

Each HTTP invocation processes at most ten recipients, claiming one immediately before each send, and stops starting new claims after 70 seconds. OAuth and FCM fetches each time out after eight seconds. Fan-out cursors and per-device state survive worker restarts. Empty recipient snapshots are final; newly registered devices do not receive old events. There is no automatic pruning or replay of failed events.

FCM does not offer an idempotency key for sends: if Google accepts a message and the worker dies before recording success, lease recovery can send it again. Stable Android notification tag `merchant-order-<order_id>`, APNs collapse ID `<order_id>`, and `data.event_id` let the platform/client replace or deduplicate that event. A notification already in flight cannot be recalled if a user signs out or is deactivated after its database claim. These are external-delivery boundaries, not claims of exactly-once receipt.

The payload contains `notification` and data strings `order_id`, `event_id`, `type='new_order'`, and `repeat` (`0` for the initial alert, `1..90` for repeats). Android priority is high; the channel comes from `channelFor` using each device's sound/vibration preferences and alert-sound choice. Background FCM and foreground alerts both use Android notification ID `0` and tag `merchant-order-<order_id>`, so a foreground/background transition replaces the same tray entry. Each repeat re-alerts through the selected channel. The small native foreground adapter gives each order's tap a distinct Intent category: Android ignores extras when matching PendingIntents, so numeric ID `0` alone would make older alerts open the newest order. Opening an order cancels only its tag/ID pair, including when opened directly from the order list. Other orders retain their entries. The body contains no customer, phone, address or payment data.

The one-entry guarantee applies to Android. iOS uses the order UUID as its APNs collapse ID and a stable local ID for foreground alerts; APNs and local notifications do not share a verified request identity, so coalescing across foreground/background on iOS is not guaranteed.

## Alert sound choice

Migration `20261107140000_alert_sound.sql` adds `fcm_tokens.alert_sound` (`'krapow'` default, `'bell'`, `'chime'` or `'system'`, with a CHECK constraint) and `set_merchant_notification_preferences_v3(...)`, the six-argument authenticated-only preference RPC. Both claim functions return `alert_sound`; the worker maps known custom sounds to `merchant_orders_<sound>` / `merchant_orders_<sound>_quiet` (quiet = no vibration), while `'system'`, unknown values and sound-off devices keep the original four channels. v2 callers keep the shipped default because their UPDATE does not touch `alert_sound`.

The merchant app declares all ten Android channels up front, because Android owns the sound for background/terminated alerts and channels are immutable after creation. The three WAV resources (`krapow_mallet`, `service_bell`, `light_chime`) live in `apps/merchant/android/app/src/main/res/raw/` and are generated deterministically by `node scripts/generate-order-alert-sounds.mjs`. Selecting a sound in Notification Settings saves it per device via v3 and plays it in the local test alert. 'System default' retains the device's standard notification sound. iOS is unaffected (it has no custom-sound bundle in this release).

## Repeat until viewed

Migration `20261107120000_merchant_notification_repeat.sql` adds per-device repeat scheduling and view acknowledgements. `20261107130000_repeat_interval_10s.sql` raises the cadence to 10 seconds and the sequence ceiling to 90. Repeats are sent by the worker, not by a Dart timer, so they work in foreground, background and terminated app states.

- `fcm_tokens.repeat_until_viewed_enabled` defaults to true and is the per-device user preference. `repeat_client_capable` defaults to false and is set to true only by the new app's `set_merchant_notification_preferences_v2(...)` call. Old APKs keep calling the original 4-arg RPC and receive exactly one alert.
- `set_merchant_notification_preferences_v2(p_device_id,p_order_alerts,p_sound,p_vibration,p_repeat_until_viewed)` and `acknowledge_merchant_order_view(p_device_id,p_order_id)` are authenticated-only. The ack writes a `merchant_notification_views` row for that token/order, deletes its repeat schedule, and skips any unsent delivery for that order. Other devices are unaffected.
- After a successful initial send, `complete_merchant_notification` arms one `merchant_notification_repeats` row per device: `next_at = now() + 10 seconds` and `expires_at = now() + 15 minutes`. A newer order replaces the row; an older out-of-order send cannot replace a newer order. Views, muted/disabled devices, expiration, sign-out/account switch and token deletion stop repeats.
- Migration `20261107150000_merchant_notification_delivery_guards.sql` prevents an order viewed before fan-out from generating a later initial alert on that device. It also lets a newer order replace an expired repeat schedule before background cleanup runs. Durable delivery/view records prevent an older completion from restarting repeats after the newer order was viewed or expired. Apply this forward migration before shipping the review fixes; the already-applied preference/repeat/sound migrations remain unchanged.
- `claim_merchant_notification_repeat()` and `complete_merchant_notification_repeat(...)` are service-role-only. Initial deliveries are always claimed first; repeats are claimed only when none are due. A successful repeat re-arms 10 seconds later without exponential backoff; a failed repeat retries after 30 seconds. The 15-minute deadline is the hard stop, which allows at most 90 repeats.
- The worker response adds `repeated` to its existing counts. A worker communicating with an older SQL schema treats a missing repeat count as zero and keeps the original stable tag.

Deploy order: migrations -> `scheduler.sql` -> worker -> merchant app. Re-run `scheduler.sql`: on pg_cron 1.5 or newer it schedules the named job every 10 seconds so repeats stay near 10 seconds; older versions use one-minute polling and repeats can be approximately 60 seconds or more apart. The wake function also checks due repeat rows. To disable repeats without dropping the migration, redeploy the previous worker and delete repeat rows or set `repeat_client_capable=false`; do not drop the migration while the new app is installed, because it expects the v2 and ack RPCs.

For the PR #516 review update, deploy `20261107150000`, then the worker with the order-based tag, then the merchant app. The migration and tag change have not been rolled out as part of this review. Existing event-tagged notifications can remain during the transition until dismissed; verify a fresh order's foreground -> background repeat and taps on two distinct orders before releasing the app.

## Required deployment setup (operator steps, not executed)

1. Apply the canonical migrations in filename order: atomic table-QR `20261105184658`, atomic bulk `20261105184805`, registration `20261105184927`, then outbox `20261105185040`, followed by the notification preference/repeat/sound migrations. The RPCs may be defined before the outbox because they write ordinary `order_events` markers; notifications become active when the outbox triggers are installed. Deploy the changed table-QR/bulk routes only after both atomic RPC migrations exist, and deploy the merchant app only after its registration and preference RPCs exist. Do not replay migrations already recorded in `supabase_migrations.schema_migrations`. The obsolete combined `073_merchant_notifications.sql` must not be applied or renamed: `073` belongs to `analytics_dine_in_count`, and the notification DDL already exists in the canonical split migrations.
2. Provision the owner allowlist as above. Staff employees need a real Auth UUID, matching current app-metadata role and `is_active=true`.
3. Enable Firebase Cloud Messaging API in the Firebase project used by the merchant app. Give a dedicated service account the target project's `roles/firebasecloudmessaging.admin` role (or a custom role with `cloudmessaging.messages.create`). Securely provision its service-account JSON; the key must be a PKCS#8 RSA private key.
4. Set Edge Function environment secrets using the operator's secret workflow: `FCM_SERVICE_ACCOUNT_JSON` (the complete JSON encoded on one line with escaped newlines) and `MERCHANT_NOTIFICATION_WORKER_SECRET` (at least 32 random bytes encoded as base64url). Hosted Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never put these values in Flutter, source control, command logs or webhook bodies.
5. Deploy `notify-admin` with JWT gateway verification disabled **for this function only**, because its independent secret performs authentication: `supabase functions deploy notify-admin --no-verify-jwt`. The handler always validates `x-merchant-worker-secret`; a bearer prefix, JWT, request order ID or payload grants no access. Any legacy INSERT webhook should be removed/replaced. `FCM_ACCESS_TOKEN` and `FCM_PROJECT_ID` are unused; project ID comes from the service-account JSON.
6. Install a reliable scheduler, described next. A manual diagnostic POST uses the same secret header and an empty JSON body. The response contains only counts or fixed error text; it never contains tokens or upstream error bodies.
7. After the matching Flutter build is deployed, verify with a test registration and test source order in a non-production environment. Validate foreground/background/tap behavior, device account switch, revocation and stale-token behavior there before production rollout. No real FCM send was performed by the regression tests.

OAuth assertions use RS256, a fixed Google token endpoint and the Firebase messaging scope. Access tokens last at most one hour, are cached in memory, refresh 60 seconds before expiry, and refresh immediately after an FCM 401. A bad credential/configuration response is retried without deleting device tokens. Only an HTTP 404 with the typed FCM error `google.firebase.fcm.v1.FcmError` and `errorCode='UNREGISTERED'` authorizes token removal; generic 404, invalid-argument, permission and quota errors do not.

## Scheduler and low latency

The optional [scheduler.sql](scheduler.sql) is deployment input, **not** an auto-applied migration. It requires existing `pg_cron`, `pg_net`, and Vault. It refuses setup if anon/authenticated can read decrypted Vault values, if those API roles can log in, or if a `pgrst.db_schemas` value present in the database exposes `net`. On hosted Supabase the `net` schema is owned by `supabase_admin`, which grants PUBLIC access; the project `postgres` role cannot revoke that platform grant. Supabase documents the grant as safe because `net` is not an exposed Data API schema and `anon`/`authenticated` are NOLOGIN, so the queue is reachable only by roles with a direct database connection. Its definer functions live in an unexposed private schema with all public/API execution revoked.

The script installs an `AFTER INSERT` outbox wake trigger. It only inserts a `pg_net` request into the current transaction's network queue; [pg_net starts HTTP after transaction commit](https://supabase.com/docs/guides/database/extensions/pg_net). A rolled-back order therefore never wakes an external worker. Ordinary local wake failures are caught in a subtransaction and emit only a fixed warning, so missing/misconfigured Vault values or enqueue faults do not roll back the source event/payment. The committed outbox remains available to scheduled polling. No caller-supplied URL, credentials or order payload can reach this wake path.

Using a privileged operator workflow, create two Vault secrets with these exact names (do not paste values into this document or a committed SQL file):

- `merchant_notification_worker_url`: `https://<PROJECT_REF>.supabase.co/functions/v1/notify-admin`.
- `merchant_notification_worker_secret`: exactly the Edge Function's `MERCHANT_NOTIFICATION_WORKER_SECRET`.

Then execute `scheduler.sql` as the trusted database operator. It installs prompt wakeup and creates/updates named cron job `merchant-order-notifications`. On pg_cron 1.5 or newer the schedule is 10 seconds, which keeps 10-second repeats close to their target; older versions keep a one-minute recovery schedule. Successful prompt wakeup starts after source commit, without waiting for cron; there is no guaranteed FCM receipt latency. If prompt wakeup cannot enqueue, polling normally adds up to one minute plus backlog/retry time. The job wakes the worker only when unexpanded or due deliveries exist. The cron command stores no credentials; its function reads Vault at execution. `pg_net` sends only an empty body and the dedicated worker secret, never the Supabase service-role key or order data. Vault access must remain restricted after installation; the platform-owned `net` queue is not API-reachable (see above) but is readable by any role with a direct database connection, so do not add login roles without reviewing that grant. Its URL validation intentionally supports standard hosted Supabase origins only.

The script selects the ten-second schedule automatically when `pg_extension.pg_cron.extversion` is 1.5 or newer. On older versions retain the minute schedule or use a trusted external scheduler with an encrypted secret store; repeat cadence then degrades to roughly a minute or more. A trusted application server can alternatively POST after a successful source commit for immediate wakeup if the optional database trigger is not installed; failed wakeups cannot lose the durable event, and cron remains the recovery path. Do not give worker credentials to merchant/customer clients. Leases make overlapping prompt/scheduled runs safe. With the notification migrations alone and no installed wakeup or scheduler, the queue is durable but nothing sends it.

Monitor `cron.job_run_details` and `net._http_response` as an operator without dumping request headers. Monitor queue state without selecting tokens:

```sql
SELECT status, count(*), max(attempts) AS max_attempts
FROM public.merchant_notification_deliveries GROUP BY status;
SELECT count(*) AS not_fully_expanded, min(created_at) AS oldest_event
FROM public.merchant_notification_outbox WHERE expanded_at IS NULL;
```

Investigate `failed` rows and old due deliveries. Credential repair does not automatically replay exhausted attempts; any replay/reset must be an explicit operator decision. Disable this scheduler by unscheduling the single named job rather than removing source triggers or deleting durable queue state.

## Local verification

The repository's existing `@electric-sql/pglite` devDependency runs real PostgreSQL PL/pgSQL, triggers, grants and RLS in memory. Tests never connect to Supabase or FCM:

```sh
npm test -- --run scripts/migration-order.test.mjs scripts/merchant-notifications.test.mjs scripts/merchant-notification-worker.test.mjs
```

Worker tests use real WebCrypto RSA signing and mocked HTTP/Supabase boundaries, including OAuth expiration, unauthorized callers, token error classification, stable payload IDs and batch limits. PGlite validates migrations against minimal fixtures matching migrations 008/019/027 and current order fields. Hosted extension availability, real concurrent database sessions, gateway deployment, scheduler operation, Firebase IAM and actual device delivery still require operator integration verification.
