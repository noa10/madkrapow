-- Run against a disposable database; all fixtures and test triggers roll back.
BEGIN;
SELECT no_plan();
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO public.categories (id, name) VALUES
  ('f2000000-0000-4000-8000-000000000001', 'POS completion test');
INSERT INTO public.menu_items (id, category_id, name, price_cents, is_available) VALUES
  ('f2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000001', 'POS test dish', 1250, true);
INSERT INTO public.restaurant_tables (id, label, is_active) VALUES
  ('f2000000-0000-4000-8000-000000000003', 'POS completion test', true);

CREATE FUNCTION pg_temp.pos_order(p_number text, p_type text, p_method text) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.create_pos_order(NULL,
    jsonb_build_object('order_number', p_number, 'order_type', p_type, 'payment_method', p_method,
      'table_id', CASE WHEN p_type = 'dine_in' THEN 'f2000000-0000-4000-8000-000000000003' ELSE NULL END,
      'pax', 2, 'total_cents', 1),
    '[{"menu_item_id":"f2000000-0000-4000-8000-000000000002","quantity":2,"price_cents":1}]'::jsonb);
$$;
CREATE TEMP TABLE pos_results AS
SELECT 'cash' AS method, pg_temp.pos_order('POS-COMP-CASH', 'take_away', 'cash') AS result
UNION ALL SELECT 'qr_pay', pg_temp.pos_order('POS-COMP-QR', 'take_away', 'qr_pay')
UNION ALL SELECT 'dine_in', pg_temp.pos_order('POS-COMP-DINE', 'dine_in', 'cash');

-- Creation: a counter pickup is completed only after its payment succeeds.
SELECT is((SELECT count(*) FROM public.orders o JOIN pos_results r ON o.id = (r.result->>'order_id')::uuid WHERE r.method IN ('cash','qr_pay') AND o.source = 'counter' AND o.delivery_type = 'self_pickup' AND o.status = 'delivered'), 2::bigint, 'cash and QR counter pickups are delivered on creation');
SELECT is((SELECT count(*) FROM public.payments p JOIN pos_results r ON p.order_id = (r.result->>'order_id')::uuid WHERE r.method IN ('cash','qr_pay') AND p.status = 'succeeded' AND p.method = r.method AND p.amount_cents = 2500), 2::bigint, 'both pickup payments use the database price');
SELECT is((SELECT count(*) FROM public.orders o JOIN pos_results r ON o.id = (r.result->>'order_id')::uuid WHERE o.total_cents = 2500), 3::bigint, 'client prices do not affect any POS total');
SELECT is((SELECT o.status FROM public.orders o JOIN pos_results r ON o.id = (r.result->>'order_id')::uuid WHERE r.method = 'dine_in'), 'paid', 'new dine-in remains paid');
SELECT is((SELECT count(*) FROM public.order_events e JOIN pos_results r ON e.order_id = (r.result->>'order_id')::uuid WHERE r.method IN ('cash','qr_pay') AND e.event_type = 'status_changed' AND e.old_value->>'status' = 'paid' AND e.new_value->>'status' = 'delivered'), 2::bigint, 'creation audits the pickup completion transition');
SELECT is((SELECT count(*) FROM pos_results WHERE (method IN ('cash','qr_pay') AND result->>'order_status' = 'delivered') OR (method = 'dine_in' AND result->>'order_status' = 'paid')), 3::bigint, 'creation returns the persisted order status');
SELECT is((SELECT count(*) FROM public.orders o JOIN pos_results r ON o.id = (r.result->>'order_id')::uuid WHERE r.method IN ('cash','qr_pay') AND o.kitchen_status = 'paid'), 2::bigint, 'new counter pickups start in the kitchen queue');
SELECT is((SELECT o.kitchen_status FROM public.orders o JOIN pos_results r ON o.id = (r.result->>'order_id')::uuid WHERE r.method = 'dine_in'), NULL::text, 'new dine-in does not receive separate kitchen state');

-- Legacy pending orders settled by the counter RPC.
INSERT INTO public.orders (id, order_number, status, source, delivery_type, subtotal_cents, total_cents) VALUES
 ('f2000000-0000-4000-8000-000000000010', 'POS-COMP-PENDING-CASH', 'pending', 'counter', 'self_pickup', 1450, 1450),
 ('f2000000-0000-4000-8000-000000000011', 'POS-COMP-PENDING-QR', 'pending', 'counter', 'self_pickup', 1600, 1600),
 ('f2000000-0000-4000-8000-000000000012', 'POS-COMP-PENDING-DINE', 'pending', 'counter', 'dine_in', 1700, 1700),
 ('f2000000-0000-4000-8000-000000000013', 'POS-COMP-PENDING-WEB', 'pending', 'web', 'self_pickup', 1800, 1800);
CREATE TEMP TABLE settlement_results AS
SELECT 'cash' AS method, public.settle_dine_in_order('f2000000-0000-4000-8000-000000000010', 'cash', NULL) AS result
UNION ALL SELECT 'qr_pay', public.settle_dine_in_order('f2000000-0000-4000-8000-000000000011', 'qr_pay', NULL)
UNION ALL SELECT 'dine_in', public.settle_dine_in_order('f2000000-0000-4000-8000-000000000012', 'cash', NULL)
UNION ALL SELECT 'web', public.settle_dine_in_order('f2000000-0000-4000-8000-000000000013', 'cash', NULL);
SELECT is((SELECT count(*) FROM settlement_results WHERE method IN ('cash','qr_pay') AND result->>'status' = 'delivered'), 2::bigint, 'legacy pickup settlement returns delivered');
SELECT is((SELECT count(*) FROM public.orders WHERE id IN ('f2000000-0000-4000-8000-000000000010','f2000000-0000-4000-8000-000000000011') AND status = 'delivered'), 2::bigint, 'legacy counter pickups become delivered');
SELECT is((SELECT count(*) FROM public.payments WHERE (order_id, method, amount_cents, status) IN (('f2000000-0000-4000-8000-000000000010'::uuid,'cash',1450,'succeeded'),('f2000000-0000-4000-8000-000000000011'::uuid,'qr_pay',1600,'succeeded'))), 2::bigint, 'legacy settlement records the correct successful payments');
SELECT is((SELECT count(*) FROM public.order_events WHERE order_id IN ('f2000000-0000-4000-8000-000000000010','f2000000-0000-4000-8000-000000000011') AND event_type = 'status_changed' AND old_value->>'status' = 'pending' AND new_value->>'status' = 'delivered'), 2::bigint, 'settlement audits the actual pending-to-delivered transition');
SELECT is((SELECT result->>'status' FROM settlement_results WHERE method = 'dine_in'), 'paid', 'legacy dine-in settlement stays paid');
SELECT is((SELECT result->>'code' FROM settlement_results WHERE method = 'web'), 'not_settleable', 'web pickup cannot be settled by counter RPC');
SELECT is((SELECT count(*) FROM public.orders WHERE id IN ('f2000000-0000-4000-8000-000000000010','f2000000-0000-4000-8000-000000000011') AND kitchen_status = 'paid'), 2::bigint, 'settled counter pickups start in the kitchen queue');
SELECT is((SELECT kitchen_status FROM public.orders WHERE id = 'f2000000-0000-4000-8000-000000000012'), NULL::text, 'settled dine-in does not receive separate kitchen state');
SELECT is((SELECT kitchen_status FROM public.orders WHERE id = 'f2000000-0000-4000-8000-000000000013'), NULL::text, 'web pickup does not receive separate kitchen state');
SELECT is(public.settle_dine_in_order('f2000000-0000-4000-8000-000000000010', 'cash', NULL)->>'code', 'already_paid', 'settlement retry is rejected');
SELECT is((SELECT count(*) FROM public.payments WHERE order_id = 'f2000000-0000-4000-8000-000000000010'), 1::bigint, 'settlement retry does not duplicate payment');

-- Kitchen queue fixtures: ready, out-of-scope channels, legacy and race rows.
INSERT INTO public.orders (id, order_number, status, source, delivery_type, subtotal_cents, total_cents, kitchen_status) VALUES
 ('f2000000-0000-4000-8000-000000000015', 'POS-COMP-READY', 'delivered', 'counter', 'self_pickup', 100, 100, 'ready'),
 ('f2000000-0000-4000-8000-000000000016', 'POS-COMP-WEB-DELIVERED', 'delivered', 'web', 'self_pickup', 100, 100, 'paid'),
 ('f2000000-0000-4000-8000-000000000017', 'POS-COMP-COUNTER-DINE', 'delivered', 'counter', 'dine_in', 100, 100, 'paid'),
 ('f2000000-0000-4000-8000-000000000018', 'POS-COMP-OLD', 'delivered', 'counter', 'self_pickup', 100, 100, NULL),
 ('f2000000-0000-4000-8000-000000000019', 'POS-COMP-RACE', 'delivered', 'counter', 'self_pickup', 100, 100, 'paid');

-- Kitchen transitions are a compare-and-set in one transaction with their audit.
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000010', 'paid', 'preparing', NULL), jsonb_build_object('ok', true, 'kitchen_status', 'preparing'), 'paid kitchen ticket advances to preparing');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000010', 'paid', 'preparing', NULL), jsonb_build_object('ok', false, 'code', 'conflict', 'kitchen_status', 'preparing'), 'stale expected state is a conflict with current state');
SELECT is((SELECT kitchen_status FROM public.orders WHERE id = 'f2000000-0000-4000-8000-000000000010'), 'preparing', 'stale transition leaves the ticket unchanged');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000010', 'preparing', 'ready', NULL)->>'ok', 'true', 'preparing ticket advances to ready');
SELECT is((SELECT count(*) FROM public.order_events WHERE order_id = 'f2000000-0000-4000-8000-000000000010' AND event_type = 'kitchen_status_changed'), 3::bigint, 'settlement and each successful transition write one audit event');
SELECT is((SELECT count(*) FROM public.order_events WHERE order_id = 'f2000000-0000-4000-8000-000000000010' AND event_type = 'kitchen_status_changed' AND old_value->>'kitchen_status' = 'paid' AND new_value->>'kitchen_status' = 'preparing'), 1::bigint, 'audit records the paid-to-preparing transition');
SELECT is((SELECT count(*) FROM public.order_events WHERE order_id = 'f2000000-0000-4000-8000-000000000010' AND event_type = 'kitchen_status_changed' AND old_value->>'kitchen_status' = 'preparing' AND new_value->>'kitchen_status' = 'ready'), 1::bigint, 'audit records the preparing-to-ready transition');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000010', 'ready', 'preparing', NULL)->>'code', 'invalid_transition', 'ready cannot move backwards');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000012', 'paid', 'preparing', NULL)->>'code', 'not_found', 'dine-in order is outside kitchen RPC scope');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000016', 'paid', 'preparing', NULL)->>'code', 'not_found', 'web pickup is outside kitchen RPC scope');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000018', 'paid', 'preparing', NULL)->>'code', 'not_found', 'legacy unmarked pickup is outside kitchen RPC scope');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000015', 'ready', 'preparing', NULL)->>'code', 'invalid_transition', 'ready ticket cannot be reset');
SELECT is(public.advance_counter_pickup_kitchen(gen_random_uuid(), 'paid', 'preparing', NULL)->>'code', 'not_found', 'unknown order is not found');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000011', 'paid', 'cooking', NULL)->>'code', 'invalid_transition', 'unknown next state is rejected');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000011', 'paid', 'preparing', NULL)->>'kitchen_status', 'preparing', 'second paid ticket advances to preparing');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000011', 'paid', 'preparing', NULL)->>'code', 'conflict', 'expected state must match persisted state');
SELECT ok(NOT has_function_privilege('anon', 'public.advance_counter_pickup_kitchen(uuid,text,text,uuid)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.advance_counter_pickup_kitchen(uuid,text,text,uuid)', 'EXECUTE') AND has_function_privilege('service_role', 'public.advance_counter_pickup_kitchen(uuid,text,text,uuid)', 'EXECUTE'), 'kitchen transition RPC is service-role only');

-- Two kitchen devices racing the same transition: the first caller wins and the
-- second is rejected. The RPC's FOR UPDATE lock serializes real concurrent
-- callers into exactly this outcome, so the CAS is proven deterministically.
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000019', 'paid', 'preparing', NULL)->>'kitchen_status', 'preparing', 'first caller wins the race');
SELECT is(public.advance_counter_pickup_kitchen('f2000000-0000-4000-8000-000000000019', 'paid', 'preparing', NULL)->>'code', 'conflict', 'second caller loses the race');
SELECT is((SELECT count(*) FROM public.order_events WHERE order_id = 'f2000000-0000-4000-8000-000000000019' AND event_type = 'kitchen_status_changed'), 1::bigint, 'race writes exactly one audit event');
SELECT is((SELECT kitchen_status FROM public.orders WHERE id = 'f2000000-0000-4000-8000-000000000019'), 'preparing', 'race persists only the winning transition');

-- Payment failure must abort the whole creation or settlement.
CREATE FUNCTION pg_temp.reject_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'test_payment_failure'; END;
$$;
CREATE TRIGGER test_pos_reject_payment BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_payment();
SELECT throws_ok($$SELECT pg_temp.pos_order('POS-COMP-FAIL', 'take_away', 'cash')$$, 'P0001', 'test_payment_failure', 'payment failure aborts creation');
SELECT is((SELECT count(*) FROM public.orders WHERE order_number = 'POS-COMP-FAIL'), 0::bigint, 'failed payment leaves no created order');
INSERT INTO public.orders (id, order_number, status, source, delivery_type, subtotal_cents, total_cents) VALUES
 ('f2000000-0000-4000-8000-000000000014', 'POS-COMP-SETTLE-FAIL', 'pending', 'counter', 'self_pickup', 1900, 1900);
SELECT throws_ok($$SELECT public.settle_dine_in_order('f2000000-0000-4000-8000-000000000014', 'cash', NULL)$$, 'P0001', 'test_payment_failure', 'payment failure aborts settlement');
SELECT is((SELECT status FROM public.orders WHERE id = 'f2000000-0000-4000-8000-000000000014'), 'pending', 'failed settlement remains pending');
SELECT is((SELECT kitchen_status FROM public.orders WHERE id = 'f2000000-0000-4000-8000-000000000014'), NULL::text, 'failed settlement never enters the kitchen queue');
DROP TRIGGER test_pos_reject_payment ON public.payments;

SELECT ok(NOT has_function_privilege('anon', 'public.create_pos_order(uuid,jsonb,jsonb)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.create_pos_order(uuid,jsonb,jsonb)', 'EXECUTE') AND has_function_privilege('service_role', 'public.create_pos_order(uuid,jsonb,jsonb)', 'EXECUTE'), 'creation RPC remains service-role only');
SELECT ok(NOT has_function_privilege('anon', 'public.settle_dine_in_order(uuid,text,uuid)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.settle_dine_in_order(uuid,text,uuid)', 'EXECUTE') AND has_function_privilege('service_role', 'public.settle_dine_in_order(uuid,text,uuid)', 'EXECUTE'), 'settlement RPC remains service-role only');
SELECT throws_ok($$UPDATE public.orders SET kitchen_status = 'invalid' WHERE id = 'f2000000-0000-4000-8000-000000000010'$$, '23514', NULL, 'invalid kitchen state is rejected');

-- Kitchen RLS: only completed counter pickups with queue state are visible.
SET LOCAL ROLE authenticated;
SET LOCAL search_path = public, extensions;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"kitchen"}}', true);
SELECT is((SELECT count(*) FROM public.orders WHERE id IN ('f2000000-0000-4000-8000-000000000010','f2000000-0000-4000-8000-000000000011')), 2::bigint, 'kitchen sees completed counter pickups in any queue state');
SELECT is((SELECT count(*) FROM public.orders WHERE id = 'f2000000-0000-4000-8000-000000000015'), 1::bigint, 'kitchen sees ready pickup updates for realtime');
SELECT is((SELECT count(*) FROM public.orders WHERE id IN ('f2000000-0000-4000-8000-000000000016','f2000000-0000-4000-8000-000000000017','f2000000-0000-4000-8000-000000000018')), 0::bigint, 'kitchen cannot see other channel, dine-in or old delivered tickets');
WITH updated AS (UPDATE public.orders SET kitchen_status = 'ready' WHERE id = 'f2000000-0000-4000-8000-000000000010' RETURNING id)
SELECT is((SELECT count(*) FROM updated), 0::bigint, 'kitchen cannot directly update orders');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
