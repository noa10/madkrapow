-- Exercise both channel ingestion RPCs against real order and payment rows.
BEGIN;
SELECT plan(30);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

CREATE FUNCTION pg_temp.channel_payload(p_number text, p_method text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'order', jsonb_build_object('order_number', p_number, 'source', 'grabfood',
      'subtotal_cents', 1250, 'total_cents', 1250, 'customer_name', 'Snapshot test',
      'payment_method', 'stripe'),
    'items', '[]'::jsonb,
    'payment', jsonb_build_object('method', p_method, 'amount_cents', 1250, 'status', 'pending'),
    'channelOrder', jsonb_build_object('channel', 'grabfood', 'external_order_id', p_number)
  );
$$;

CREATE TEMP TABLE channel_results (rpc text, method text, result jsonb);
INSERT INTO channel_results VALUES
  ('import', 'cash', public.import_channel_order(pg_temp.channel_payload('SNAPSHOT-IMPORT-CASH', 'cash'))),
  ('import', 'grabfood', public.import_channel_order(pg_temp.channel_payload('SNAPSHOT-IMPORT-GRAB', 'grabfood'))),
  ('import', 'other', public.import_channel_order(pg_temp.channel_payload('SNAPSHOT-IMPORT-DEFAULT', NULL))),
  ('apply', 'cash', public.apply_channel_order(pg_temp.channel_payload('SNAPSHOT-APPLY-CASH', 'cash'))),
  ('apply', 'grabfood', public.apply_channel_order(pg_temp.channel_payload('SNAPSHOT-APPLY-GRAB', 'grabfood'))),
  ('apply', 'other', public.apply_channel_order(pg_temp.channel_payload('SNAPSHOT-APPLY-DEFAULT', NULL)));

SELECT is((SELECT count(*) FROM channel_results WHERE result->>'status' = 'created'), 6::bigint, 'both RPCs create all six orders');
SELECT is((SELECT count(*) FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid JOIN public.payments p ON p.order_id = o.id WHERE o.payment_method = p.method AND p.method = r.method), 6::bigint, 'all snapshots match the payment ledger including the default');
SELECT is((SELECT o.payment_method FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid WHERE r.rpc = 'import' AND r.method = 'cash'), 'cash', 'import snapshots cash');
SELECT is((SELECT o.payment_method FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid WHERE r.rpc = 'import' AND r.method = 'grabfood'), 'grabfood', 'import snapshots platform payment');
SELECT is((SELECT o.payment_method FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid WHERE r.rpc = 'import' AND r.method = 'other'), 'other', 'import snapshots payment fallback');
SELECT is((SELECT o.payment_method FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid WHERE r.rpc = 'apply' AND r.method = 'cash'), 'cash', 'apply snapshots cash');
SELECT is((SELECT o.payment_method FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid WHERE r.rpc = 'apply' AND r.method = 'grabfood'), 'grabfood', 'apply snapshots platform payment');
SELECT is((SELECT o.payment_method FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid WHERE r.rpc = 'apply' AND r.method = 'other'), 'other', 'apply snapshots payment fallback');
SELECT is((SELECT count(*) FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid WHERE o.customer_name = 'Snapshot test' AND o.total_cents = 1250), 6::bigint, 'order data remains intact');
SELECT is((SELECT count(*) FROM channel_results r JOIN public.payments p ON p.order_id = (r.result->>'order_id')::uuid WHERE r.rpc = 'import' AND p.status = 'succeeded'), 3::bigint, 'import retains succeeded payment behavior');
SELECT is((SELECT count(*) FROM channel_results r JOIN public.payments p ON p.order_id = (r.result->>'order_id')::uuid WHERE r.rpc = 'apply' AND p.status = 'pending'), 3::bigint, 'apply retains pending payment behavior');
SELECT is((SELECT count(*) FROM channel_results r JOIN public.channel_orders c ON c.order_id = (r.result->>'order_id')::uuid), 6::bigint, 'channel identities are inserted');
SELECT is((SELECT count(*) FROM channel_results r JOIN public.order_events e ON e.order_id = (r.result->>'order_id')::uuid WHERE e.event_type = 'channel_created'), 6::bigint, 'order events are inserted');
SELECT is(public.import_channel_order(pg_temp.channel_payload('SNAPSHOT-IMPORT-CASH', 'grabfood'))->>'status', 'skipped', 'import replay is skipped');
SELECT is(public.apply_channel_order(pg_temp.channel_payload('SNAPSHOT-APPLY-CASH', 'grabfood'))->>'status', 'skipped', 'apply replay is skipped');
SELECT is((SELECT count(*) FROM public.orders WHERE order_number LIKE 'SNAPSHOT-%'), 6::bigint, 'replays create no additional orders');
SELECT is((SELECT count(*) FROM channel_results r JOIN public.payments p ON p.order_id = (r.result->>'order_id')::uuid), 6::bigint, 'replays create no additional payments');
SELECT is((SELECT count(*) FROM channel_results r JOIN public.orders o ON o.id = (r.result->>'order_id')::uuid WHERE r.method = 'cash' AND o.payment_method = 'cash'), 2::bigint, 'replays do not change snapshots');

-- The source events exist before processing and must remain unchanged on failure.
INSERT INTO public.integration_events (id, provider, event_type, payload, status, attempts, locked_until)
VALUES
  ('f2000000-0000-4000-8000-000000000001', 'grabfood', 'order', '{}'::jsonb, 'received', 1, now() - interval '1 minute'),
  ('f2000000-0000-4000-8000-000000000002', 'grabfood', 'order', '{}'::jsonb, 'received', 1, now() + interval '10 minutes');

CREATE TEMP TABLE failure_baseline AS
SELECT (SELECT count(*) FROM public.payments) AS payments,
       (SELECT count(*) FROM public.channel_orders) AS channel_orders,
       (SELECT count(*) FROM public.order_events) AS order_events,
       (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.integration_events e
        WHERE e.id IN ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002')) AS events;

SELECT is(public.apply_channel_order(
  pg_temp.channel_payload('SNAPSHOT-LEASE-EXPIRED', 'cash') ||
  jsonb_build_object('sourceEventId', 'f2000000-0000-4000-8000-000000000001', 'sourceEventAttempts', 1)
), '{"status":"error","reason":"event lease lost"}'::jsonb, 'expired event lease is fenced');
SELECT is((SELECT count(*) FROM public.orders WHERE order_number = 'SNAPSHOT-LEASE-EXPIRED'), 0::bigint, 'expired lease creates no order');
SELECT is((SELECT count(*) FROM public.payments), (SELECT payments FROM failure_baseline), 'expired lease creates no payment');
SELECT is((SELECT count(*) FROM public.channel_orders), (SELECT channel_orders FROM failure_baseline), 'expired lease creates no channel order');
SELECT is((SELECT count(*) FROM public.order_events), (SELECT order_events FROM failure_baseline), 'expired lease creates no order event');
SELECT is((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.integration_events e WHERE e.id IN ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002')), (SELECT events FROM failure_baseline), 'expired lease leaves source events unchanged');

-- The invalid payment status reaches the real payments_status_check after the order insert.
SELECT throws_ok($test$
  SELECT public.apply_channel_order(
    jsonb_set(pg_temp.channel_payload('SNAPSHOT-PAYMENT-FAIL', 'cash'), '{payment,status}', '"invalid"'::jsonb) ||
    jsonb_build_object('sourceEventId', 'f2000000-0000-4000-8000-000000000002', 'sourceEventAttempts', 1)
  )
$test$, '23514', 'new row for relation "payments" violates check constraint "payments_status_check"', 'payment constraint failure is raised after order insertion');
SELECT is((SELECT count(*) FROM public.orders WHERE order_number = 'SNAPSHOT-PAYMENT-FAIL'), 0::bigint, 'payment constraint failure rolls back the order');
SELECT is((SELECT count(*) FROM public.payments), (SELECT payments FROM failure_baseline), 'payment constraint failure leaves no payment');
SELECT is((SELECT count(*) FROM public.channel_orders), (SELECT channel_orders FROM failure_baseline), 'payment constraint failure leaves no channel order');
SELECT is((SELECT count(*) FROM public.order_events), (SELECT order_events FROM failure_baseline), 'payment constraint failure leaves no order event');
SELECT is((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.integration_events e WHERE e.id IN ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002')), (SELECT events FROM failure_baseline), 'payment constraint failure leaves source events unchanged');

SELECT * FROM finish();
ROLLBACK;
