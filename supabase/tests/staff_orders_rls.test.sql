-- staff_all_orders RLS narrowing (075): kitchen sees only the kitchen-queue
-- set; cashier/manager/admin keep full SELECT (they use /admin/orders);
-- staff JWTs have no INSERT/UPDATE/DELETE on orders. Probes run as the
-- authenticated role with a simulated JWT: the pg_prove connection is
-- superuser and bypasses RLS, so SET LOCAL ROLE is required.
BEGIN;
SELECT plan(6);
INSERT INTO orders (order_number, status, source, delivery_type, subtotal_cents, total_cents) VALUES
  ('RLS-O1', 'paid', 'counter', 'dine_in', 1000, 1000),
  ('RLS-O2', 'delivered', 'web', 'delivery', 2000, 2000),
  ('RLS-O3', 'ready', 'web', 'self_pickup', 1500, 1500),
  ('RLS-O4', 'pending', 'counter', 'dine_in', 1200, 1200);
-- Kitchen: only the kitchen-queue set is visible.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"kitchen"}}', true);
SELECT is((SELECT count(*) FROM orders WHERE status = 'delivered'), 0::bigint, 'kitchen cannot read completed orders');
SELECT is((SELECT count(*) FROM orders WHERE status = 'ready'), 1::bigint, 'kitchen sees active kitchen tickets');
SELECT is((SELECT count(*) FROM orders WHERE status = 'pending' AND delivery_type = 'dine_in'), 1::bigint, 'kitchen sees pending dine-in tickets');
RESET ROLE;
-- Cashier: full history by design (/admin/orders is cashier-visible).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"cashier"}}', true);
SELECT is((SELECT count(*) FROM orders), 4::bigint, 'cashier reads full order history by design');
RESET ROLE;
-- Authenticated without a staff role claim: nothing visible.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT is((SELECT count(*) FROM orders), 0::bigint, 'authenticated without staff role sees nothing');
RESET ROLE;
-- Staff JWTs have no INSERT path on orders (writes are service-role only).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"cashier"}}', true);
SELECT throws_ok(
  'INSERT INTO orders (order_number, status, source, delivery_type, subtotal_cents, total_cents) VALUES (''RLS-I1'', ''pending'', ''counter'', ''dine_in'', 500, 500)',
  '42501', NULL, 'staff role cannot insert into orders');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
