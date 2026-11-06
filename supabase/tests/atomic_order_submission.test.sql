-- Exercise the real submission functions, rate-limit trigger and notification
-- outbox in a disposable database. All fixtures are rolled back.
BEGIN;
SELECT plan(44);
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
END;
$$;
UPDATE public.merchant_notification_config SET activated_at = now() - interval '1 day' WHERE singleton;

INSERT INTO public.categories (id, name) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'Atomic submission test');
INSERT INTO public.menu_items (id, category_id, name, price_cents, is_available) VALUES
  ('f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001', 'Test dish', 1250, true),
  ('f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001', 'Test side', 800, true),
  ('f1000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000001', 'Sold out', 500, false);
INSERT INTO public.modifier_groups (id, name) VALUES
  ('f1000000-0000-4000-8000-000000000005', 'Test extras');
INSERT INTO public.modifiers (id, modifier_group_id, name, price_delta_cents, is_available) VALUES
  ('f1000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000005', 'Test egg', 200, true);
INSERT INTO public.menu_item_modifier_groups (menu_item_id, modifier_group_id) VALUES
  ('f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000005');
INSERT INTO public.restaurant_tables (id, label, is_active) VALUES
  ('f1000000-0000-4000-8000-000000000007', 'Atomic QR cap', true),
  ('f1000000-0000-4000-8000-000000000008', 'Atomic QR rollback', true);
INSERT INTO public.customers (id, auth_user_id, name) VALUES
  ('f1000000-0000-4000-8000-000000000009', 'f1000000-0000-4000-8000-000000000010', 'Bulk test customer');

CREATE FUNCTION pg_temp.table_order(p_number text, p_table uuid, p_key text, p_subtotal integer)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_table_qr_order(
    jsonb_build_object('order_number', p_number, 'table_id', p_table, 'pax', 2,
      'subtotal_cents', p_subtotal, 'idempotency_key', p_key),
    jsonb_build_array(jsonb_build_object(
      'menu_item_id', 'f1000000-0000-4000-8000-000000000002', 'quantity', 2,
      'modifiers', jsonb_build_array(jsonb_build_object('modifier_id', 'f1000000-0000-4000-8000-000000000006'))
    ))
  );
$$;

CREATE FUNCTION pg_temp.bulk_order(p_number text, p_user uuid, p_items jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.submit_bulk_order(
    p_user, 'f1000000-0000-4000-8000-000000000009'::uuid,
    jsonb_build_object('order_number', p_number, 'company_name', 'Test company',
      'contact_phone', '0123456789', 'delivery_type', 'self_pickup',
      'scheduled_for', '2099-01-10T12:30:00Z', 'requested_date', '2099-01-10',
      'budget_cents', 12500, 'kitchen_lead_minutes', 20),
    p_items
  );
$$;

CREATE TEMP TABLE qr_original AS
  SELECT pg_temp.table_order('ATOMIC-QR-1', 'f1000000-0000-4000-8000-000000000007', 'atomic-qr-test-key-0001', 2900) AS result;
SELECT is((SELECT result->>'duplicate' FROM qr_original), 'false', 'first table order is new');
SELECT is((SELECT result->>'total_cents' FROM qr_original), '2900', 'table total uses database prices');
SELECT is((SELECT count(*) FROM public.order_items WHERE order_id = (SELECT (result->>'order_id')::uuid FROM qr_original)),
  1::bigint, 'table order has its item');
SELECT is((SELECT count(*) FROM public.order_events WHERE order_id = (SELECT (result->>'order_id')::uuid FROM qr_original) AND event_type = 'table_order_placed'),
  1::bigint, 'table order and source event commit together');
SELECT is((SELECT count(*) FROM public.merchant_notification_outbox WHERE order_id = (SELECT (result->>'order_id')::uuid FROM qr_original)),
  1::bigint, 'table order enqueues one notification');

DO $$
BEGIN
  PERFORM pg_temp.table_order('ATOMIC-QR-2', 'f1000000-0000-4000-8000-000000000007', 'atomic-qr-test-key-0002', 2900);
  PERFORM pg_temp.table_order('ATOMIC-QR-3', 'f1000000-0000-4000-8000-000000000007', 'atomic-qr-test-key-0003', 2900);
  PERFORM pg_temp.table_order('ATOMIC-QR-4', 'f1000000-0000-4000-8000-000000000007', 'atomic-qr-test-key-0004', 2900);
END;
$$;
CREATE TEMP TABLE qr_retry AS
  SELECT pg_temp.table_order('ATOMIC-QR-RETRY', 'f1000000-0000-4000-8000-000000000007', 'atomic-qr-test-key-0001', 2900) AS result;
SELECT is((SELECT result->>'duplicate' FROM qr_retry), 'true', 'retry at the rate cap is a duplicate');
SELECT is((SELECT result->>'order_id' FROM qr_retry), (SELECT result->>'order_id' FROM qr_original), 'retry returns the original order');
SELECT is((SELECT count(*) FROM public.orders WHERE table_id = 'f1000000-0000-4000-8000-000000000007'),
  4::bigint, 'retry does not insert another table order');
SELECT is((SELECT count(*) FROM public.order_events e JOIN public.orders o ON o.id = e.order_id WHERE o.table_id = 'f1000000-0000-4000-8000-000000000007' AND e.event_type = 'table_order_placed'),
  4::bigint, 'retry does not insert another table event');
SELECT is((SELECT count(*) FROM public.merchant_notification_outbox n JOIN public.orders o ON o.id = n.order_id WHERE o.table_id = 'f1000000-0000-4000-8000-000000000007'),
  4::bigint, 'retry does not enqueue another notification');
SELECT throws_ok($$SELECT pg_temp.table_order('ATOMIC-QR-5', 'f1000000-0000-4000-8000-000000000007', 'atomic-qr-test-key-0005', 2900)$$,
  'P0001', 'table_order_rate_limited', 'a new fifth table order is rate limited');
SELECT throws_ok($$SELECT pg_temp.table_order('ATOMIC-QR-CONFLICT', 'f1000000-0000-4000-8000-000000000008', 'atomic-qr-test-key-0001', 2900)$$,
  'P0001', 'idempotency_key_conflict', 'replaying an idempotency key at another table is a conflict');

CREATE TEMP TABLE before_qr_failure AS SELECT
  (SELECT count(*) FROM public.orders) AS orders,
  (SELECT count(*) FROM public.order_items) AS items,
  (SELECT count(*) FROM public.order_item_modifiers) AS modifiers,
  (SELECT count(*) FROM public.order_events) AS events,
  (SELECT count(*) FROM public.merchant_notification_outbox) AS outbox;
UPDATE public.menu_items SET price_cents = 1300 WHERE id = 'f1000000-0000-4000-8000-000000000002';
SELECT throws_ok($$SELECT pg_temp.table_order('ATOMIC-QR-STALE', 'f1000000-0000-4000-8000-000000000008', NULL, 2900)$$,
  'P0001', 'table_order_total_mismatch', 'a stale validated price aborts table submission');
UPDATE public.menu_items SET is_available = false WHERE id = 'f1000000-0000-4000-8000-000000000002';
SELECT throws_ok($$SELECT pg_temp.table_order('ATOMIC-QR-SOLD-OUT', 'f1000000-0000-4000-8000-000000000008', NULL, 3000)$$,
  'P0001', 'table_order_item_unavailable', 'a newly unavailable dish aborts table submission');
UPDATE public.menu_items SET price_cents = 1250, is_available = true WHERE id = 'f1000000-0000-4000-8000-000000000002';
SELECT is((SELECT count(*) FROM public.orders), (SELECT orders FROM before_qr_failure), 'failed table orders leave no headers');
SELECT is((SELECT count(*) FROM public.order_items), (SELECT items FROM before_qr_failure), 'failed table orders leave no lines');
SELECT is((SELECT count(*) FROM public.order_item_modifiers), (SELECT modifiers FROM before_qr_failure), 'failed table orders leave no modifiers');
SELECT is((SELECT count(*) FROM public.order_events), (SELECT events FROM before_qr_failure), 'failed table orders leave no events');
SELECT is((SELECT count(*) FROM public.merchant_notification_outbox), (SELECT outbox FROM before_qr_failure), 'failed table orders leave no notifications');
UPDATE public.menu_items SET price_cents = 2147483647 WHERE id = 'f1000000-0000-4000-8000-000000000002';
SELECT throws_ok($$SELECT pg_temp.table_order('ATOMIC-QR-OVERSIZE', 'f1000000-0000-4000-8000-000000000008', NULL, 0)$$,
  'P0001', 'table_order_total_too_large', 'a table line above the integer ceiling aborts submission');
UPDATE public.menu_items SET price_cents = 1250 WHERE id = 'f1000000-0000-4000-8000-000000000002';

CREATE TEMP TABLE bulk_success AS SELECT pg_temp.bulk_order(
  'ATOMIC-BULK-1', 'f1000000-0000-4000-8000-000000000010',
  '[{"menu_item_id":"f1000000-0000-4000-8000-000000000002","quantity":2,"modifier_ids":["f1000000-0000-4000-8000-000000000006"]},
    {"menu_item_id":"f1000000-0000-4000-8000-000000000003","quantity":1,"modifier_ids":[]}]'::jsonb
) AS result;
SELECT is((SELECT status FROM public.orders WHERE id = (SELECT (result->>'order_id')::uuid FROM bulk_success)), 'pending', 'bulk order is pending');
SELECT is((SELECT approval_status FROM public.orders WHERE id = (SELECT (result->>'order_id')::uuid FROM bulk_success)), 'pending_review', 'bulk order requires review');
SELECT is((SELECT total_cents FROM public.orders WHERE id = (SELECT (result->>'order_id')::uuid FROM bulk_success)), 3300, 'bulk total uses database base prices');
SELECT is((SELECT count(*) FROM public.order_items WHERE order_id = (SELECT (result->>'order_id')::uuid FROM bulk_success)), 2::bigint, 'both bulk lines commit');
SELECT is((SELECT menu_item_name FROM public.order_items WHERE order_id = (SELECT (result->>'order_id')::uuid FROM bulk_success) AND menu_item_id = 'f1000000-0000-4000-8000-000000000002'), 'Test dish', 'bulk item name is read from the database');
SELECT is((SELECT m.modifier_price_delta_cents FROM public.order_item_modifiers m JOIN public.order_items i ON i.id = m.order_item_id WHERE i.order_id = (SELECT (result->>'order_id')::uuid FROM bulk_success)), 200, 'bulk modifier snapshot is read from the database');
SELECT is((SELECT count(*) FROM public.order_events WHERE order_id = (SELECT (result->>'order_id')::uuid FROM bulk_success) AND event_type = 'bulk_submitted'), 1::bigint, 'bulk source event commits');
SELECT is((SELECT count(*) FROM public.merchant_notification_outbox WHERE order_id = (SELECT (result->>'order_id')::uuid FROM bulk_success)), 1::bigint, 'bulk order enqueues one notification');
SELECT is((SELECT count(*) FROM public.payments WHERE order_id = (SELECT (result->>'order_id')::uuid FROM bulk_success)), 0::bigint, 'bulk submission creates no payment');

CREATE TEMP TABLE before_bulk_failure AS SELECT
  (SELECT count(*) FROM public.orders) AS orders,
  (SELECT count(*) FROM public.order_items) AS items,
  (SELECT count(*) FROM public.order_item_modifiers) AS modifiers,
  (SELECT count(*) FROM public.order_events) AS events,
  (SELECT count(*) FROM public.merchant_notification_outbox) AS outbox;
SELECT throws_ok($$SELECT pg_temp.bulk_order('ATOMIC-BULK-FAIL', 'f1000000-0000-4000-8000-000000000010',
  '[{"menu_item_id":"f1000000-0000-4000-8000-000000000002","quantity":1,"modifier_ids":["f1000000-0000-4000-8000-000000000006"]},
    {"menu_item_id":"f1000000-0000-4000-8000-000000000004","quantity":1,"modifier_ids":[]}]'::jsonb)$$,
  'P0001', 'bulk_item_unavailable', 'a bad later line aborts the whole bulk submission');
SELECT throws_ok($$SELECT pg_temp.bulk_order('ATOMIC-BULK-OWNER', 'f1000000-0000-4000-8000-000000000011', '[]'::jsonb)$$,
  'P0001', 'bulk_customer_mismatch', 'bulk submission rejects a different customer owner');
UPDATE public.menu_items SET price_cents = 2147483647 WHERE id = 'f1000000-0000-4000-8000-000000000003';
SELECT throws_ok($$SELECT pg_temp.bulk_order('ATOMIC-BULK-OVERSIZE', 'f1000000-0000-4000-8000-000000000010',
  '[{"menu_item_id":"f1000000-0000-4000-8000-000000000003","quantity":2,"modifier_ids":[]}]'::jsonb)$$,
  'P0001', 'bulk_total_too_large', 'a bulk line above the integer ceiling aborts submission');
UPDATE public.menu_items SET price_cents = 800 WHERE id = 'f1000000-0000-4000-8000-000000000003';

CREATE FUNCTION pg_temp.fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'test_outbox_failure';
END;
$$;
CREATE TRIGGER atomic_test_outbox_failure BEFORE INSERT ON public.merchant_notification_outbox
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_outbox();
SELECT throws_ok($$SELECT pg_temp.bulk_order('ATOMIC-BULK-OUTBOX-FAIL', 'f1000000-0000-4000-8000-000000000010',
  '[{"menu_item_id":"f1000000-0000-4000-8000-000000000002","quantity":1,"modifier_ids":["f1000000-0000-4000-8000-000000000006"]}]'::jsonb)$$,
  'P0001', 'test_outbox_failure', 'notification enqueue failure aborts the entire bulk submission');
DROP TRIGGER atomic_test_outbox_failure ON public.merchant_notification_outbox;
SELECT is((SELECT count(*) FROM public.orders), (SELECT orders FROM before_bulk_failure), 'failed bulk submissions leave no headers');
SELECT is((SELECT count(*) FROM public.order_items), (SELECT items FROM before_bulk_failure), 'failed bulk submissions leave no lines');
SELECT is((SELECT count(*) FROM public.order_item_modifiers), (SELECT modifiers FROM before_bulk_failure), 'failed bulk submissions leave no modifiers');
SELECT is((SELECT count(*) FROM public.order_events), (SELECT events FROM before_bulk_failure), 'failed bulk submissions leave no events');
SELECT is((SELECT count(*) FROM public.merchant_notification_outbox), (SELECT outbox FROM before_bulk_failure), 'failed bulk submissions leave no notifications');

SELECT ok(NOT has_function_privilege('anon', 'public.create_table_qr_order(jsonb,jsonb)', 'EXECUTE'), 'anonymous users cannot call the table RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_table_qr_order(jsonb,jsonb)', 'EXECUTE'), 'authenticated users cannot call the table RPC');
SELECT ok(has_function_privilege('service_role', 'public.create_table_qr_order(jsonb,jsonb)', 'EXECUTE'), 'service role can call the table RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.submit_bulk_order(uuid,uuid,jsonb,jsonb)', 'EXECUTE'), 'anonymous users cannot call the bulk RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.submit_bulk_order(uuid,uuid,jsonb,jsonb)', 'EXECUTE'), 'authenticated users cannot call the bulk RPC');
SELECT ok(has_function_privilege('service_role', 'public.submit_bulk_order(uuid,uuid,jsonb,jsonb)', 'EXECUTE'), 'service role can call the bulk RPC');

SELECT * FROM finish();
ROLLBACK;
