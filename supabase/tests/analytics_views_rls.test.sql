-- Analytics views honour the caller's RLS (081) AND are gated by grants (082).
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

-- Anonymous callers are denied at the privilege layer (082) before RLS runs.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT throws_ok('SELECT * FROM daily_order_summary', '42501', NULL,
  'anon is denied daily revenue by grants');
SELECT throws_ok('SELECT * FROM top_selling_items', '42501', NULL,
  'anon is denied per-item revenue by grants');
RESET ROLE;

-- A signed-in caller without a staff role is allowed through the grants but
-- filtered to zero rows by RLS — this is the security_invoker contract (081).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM daily_channel_summary), 0::bigint,
  'unprivileged authenticated sees no channel revenue (RLS)');
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
