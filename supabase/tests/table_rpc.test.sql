BEGIN;

SELECT plan(11);

INSERT INTO restaurant_tables (id, label, is_active) VALUES
  ('10000000-0000-0000-0000-000000000001', 'RPC test occupied', true),
  ('10000000-0000-0000-0000-000000000002', 'RPC test inactive', false),
  ('10000000-0000-0000-0000-000000000003', 'RPC test deleted', true);

INSERT INTO orders (id, order_number, status, source, delivery_type, table_id, subtotal_cents, total_cents)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'RPC-TEST-1', 'pending', 'counter', 'dine_in', '10000000-0000-0000-0000-000000000001', 1000, 1000),
  ('20000000-0000-0000-0000-000000000002', 'RPC-TEST-2', 'pending', 'counter', 'dine_in', '10000000-0000-0000-0000-000000000001', 2000, 2000);

SELECT is(
  settle_dine_in_table('10000000-0000-0000-0000-000000000001', 'cash', NULL,
    ARRAY['20000000-0000-0000-0000-000000000001'::uuid])->>'code',
  'stale_settle', 'settlement rejects a stale order set'
);
SELECT is((SELECT count(*) FROM payments WHERE order_id IN (
  '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')),
  0::bigint, 'stale settlement creates no payments');
SELECT is(
  deactivate_restaurant_table('10000000-0000-0000-0000-000000000001', NULL)->>'code',
  'has_orders', 'cannot deactivate an occupied table'
);
SELECT is(
  delete_restaurant_table('10000000-0000-0000-0000-000000000001', NULL)->>'code',
  'has_orders', 'cannot delete a table with orders'
);
SELECT throws_ok(
  $$INSERT INTO orders (order_number, status, source, delivery_type, table_id, subtotal_cents, total_cents)
    VALUES ('RPC-TEST-INACTIVE', 'pending', 'counter', 'dine_in', '10000000-0000-0000-0000-000000000002', 100, 100)$$,
  'P0001', 'table_inactive', 'orders on an inactive table are rejected'
);
SELECT is(
  settle_dine_in_table('10000000-0000-0000-0000-000000000001', 'cash', NULL,
    ARRAY['20000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid])->>'ok',
  'true', 'settles the confirmed set'
);
SELECT is(
  settle_dine_in_table('10000000-0000-0000-0000-000000000001', 'cash', NULL,
    ARRAY['20000000-0000-0000-0000-000000000001'::uuid, '20000000-0000-0000-0000-000000000002'::uuid])->>'code',
  'nothing_to_settle', 'retry returns nothing_to_settle for the API to map to already_settled'
);
SELECT is((SELECT count(*) FROM payments WHERE order_id IN (
  '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')),
  2::bigint, 'settlement retry creates no duplicate payments');
SELECT is(
  close_dine_in_table('10000000-0000-0000-0000-000000000001', NULL,
    ARRAY['20000000-0000-0000-0000-000000000001'::uuid])->>'code',
  'stale_close', 'closing rejects a stale order set'
);
SELECT is(
  delete_restaurant_table('10000000-0000-0000-0000-000000000003', NULL)->>'ok',
  'true', 'deletes an empty table'
);
SELECT is((SELECT count(*) FROM table_events
  WHERE table_id IS NULL AND table_label = 'RPC test deleted' AND event_type = 'deleted'),
  1::bigint, 'table delete event survives with its label');

SELECT * FROM finish();
ROLLBACK;
