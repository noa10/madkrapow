-- Analytics view grants (082). RLS (081) is the primary control; this asserts
-- the privilege layer as defence in depth and that the admin user-session
-- client still has the SELECT it needs.
BEGIN;
SELECT plan(7);

SELECT ok(NOT has_table_privilege('anon', 'daily_order_summary', 'SELECT'),
  'anon has no SELECT on daily_order_summary');
SELECT ok(NOT has_table_privilege('anon', 'top_selling_items', 'SELECT'),
  'anon has no SELECT on top_selling_items');
SELECT ok(NOT has_table_privilege('anon', 'daily_channel_summary', 'SELECT'),
  'anon has no SELECT on daily_channel_summary');

-- The admin analytics route queries with a user-session client (role
-- authenticated, JWT app_metadata.role = admin), so SELECT must survive.
SELECT ok(has_table_privilege('authenticated', 'top_selling_items', 'SELECT'),
  'authenticated keeps SELECT for /api/admin/analytics');
SELECT ok(NOT has_table_privilege('authenticated', 'top_selling_items', 'INSERT'),
  'authenticated cannot insert into the aggregate view');
SELECT ok(has_table_privilege('service_role', 'top_selling_items', 'SELECT'),
  'service_role keeps SELECT');

-- Behaviour, not just the ACL: an actual anon query is denied by privileges
-- before RLS even runs.
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM top_selling_items', '42501', NULL,
  'anon SELECT raises insufficient_privilege');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
