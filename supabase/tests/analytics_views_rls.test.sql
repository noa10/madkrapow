-- Analytics views must honour the caller's RLS (081).
--
-- The pg_prove connection is a superuser and bypasses RLS, so SET LOCAL ROLE
-- plus a simulated JWT is required (same pattern as staff_orders_rls.test.sql).
BEGIN;
SELECT plan(4);

INSERT INTO categories (id, name) VALUES
  ('72000000-0000-4000-8000-000000000001', 'analytics rls probe');
INSERT INTO menu_items (id, category_id, name, price_cents) VALUES
  ('72000000-0000-4000-8000-000000000002', '72000000-0000-4000-8000-000000000001', 'Analytics Probe Item', 1000);
INSERT INTO orders (order_number, status, source, delivery_type, subtotal_cents, total_cents) VALUES
  ('AVIEW-1', 'delivered', 'counter', 'dine_in', 1000, 1000);
INSERT INTO order_items (order_id, menu_item_id, menu_item_name, menu_item_price_cents, quantity, line_total_cents)
SELECT id, '72000000-0000-4000-8000-000000000002', 'Analytics Probe Item', 1000, 1, 1000
  FROM orders WHERE order_number = 'AVIEW-1';

-- Anonymous callers: no revenue, no quantities, no channel mix.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is((SELECT count(*) FROM daily_order_summary), 0::bigint,
  'anon sees no daily revenue');
SELECT is((SELECT count(*) FROM daily_channel_summary), 0::bigint,
  'anon sees no per-channel revenue');
SELECT is((SELECT count(*) FROM top_selling_items), 0::bigint,
  'anon sees no per-item revenue');
RESET ROLE;

-- Admin JWT: the analytics page still gets its data.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
SELECT is(
  (SELECT count(*) FROM top_selling_items WHERE menu_item_id = '72000000-0000-4000-8000-000000000002'),
  1::bigint,
  'admin session still reads the item aggregates');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
