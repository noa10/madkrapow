BEGIN;
SELECT plan(4);

-- One catalog item sold under two historical names (the HubboPOS rename case),
-- plus a cancelled order that must not contribute.
INSERT INTO categories (id, name) VALUES
  ('71000000-0000-4000-8000-000000000001', 'top sellers probe');
INSERT INTO menu_items (id, category_id, name, price_cents) VALUES
  ('71000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000001', 'Canonical Krapow', 1000);
INSERT INTO orders (order_number, status, source, subtotal_cents, total_cents) VALUES
  ('TOP-1', 'delivered', 'counter', 2000, 2000),
  ('TOP-2', 'delivered', 'counter', 1000, 1000),
  ('TOP-3', 'cancelled', 'counter', 5000, 5000);
INSERT INTO order_items (order_id, menu_item_id, menu_item_name, menu_item_price_cents, quantity, line_total_cents)
SELECT id, '71000000-0000-4000-8000-000000000002', 'Beef Krapow Set', 1000, 2, 2000
  FROM orders WHERE order_number = 'TOP-1';
INSERT INTO order_items (order_id, menu_item_id, menu_item_name, menu_item_price_cents, quantity, line_total_cents)
SELECT id, '71000000-0000-4000-8000-000000000002', 'Set Krapow Daging', 1000, 1, 1000
  FROM orders WHERE order_number = 'TOP-2';
INSERT INTO order_items (order_id, menu_item_id, menu_item_name, menu_item_price_cents, quantity, line_total_cents)
SELECT id, '71000000-0000-4000-8000-000000000002', 'Set Krapow', 1000, 5, 5000
  FROM orders WHERE order_number = 'TOP-3';

SELECT is(
  (SELECT count(*) FROM top_selling_items WHERE menu_item_id = '71000000-0000-4000-8000-000000000002'),
  1::bigint,
  'one report row per menu_item_id even when line names differ');
SELECT is(
  (SELECT menu_item_name FROM top_selling_items WHERE menu_item_id = '71000000-0000-4000-8000-000000000002'),
  'Canonical Krapow',
  'display name comes from the catalog, not the historical line snapshot');
SELECT is(
  (SELECT total_quantity FROM top_selling_items WHERE menu_item_id = '71000000-0000-4000-8000-000000000002'),
  3::bigint,
  'quantities from renamed lines are summed together');
SELECT is(
  (SELECT total_revenue_cents FROM top_selling_items WHERE menu_item_id = '71000000-0000-4000-8000-000000000002'),
  3000::bigint,
  'cancelled order is still excluded by the status filter');

SELECT * FROM finish();
ROLLBACK;
