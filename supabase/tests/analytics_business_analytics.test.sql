BEGIN;
SELECT plan(25);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO categories (id, name) VALUES ('73000000-0000-4000-8000-000000000001', 'analytics range probe');
INSERT INTO menu_items (id, category_id, name, price_cents) VALUES
 ('73000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000001', 'Range Probe', 1000);
INSERT INTO orders (order_number, status, source, delivery_type, subtotal_cents, total_cents, created_at) VALUES
 ('ARANGE-1', 'delivered', 'counter', 'dine_in', 1000, 1000, '2026-01-02 12:00:00+00'),
 ('ARANGE-2', 'delivered', 'counter', 'dine_in', 3000, 3000, '2026-02-02 12:00:00+00'),
 ('ARANGE-3', 'cancelled', 'counter', 'dine_in', 9000, 9000, '2026-01-03 12:00:00+00');
INSERT INTO order_items (order_id, menu_item_id, menu_item_name, menu_item_price_cents, quantity, line_total_cents)
SELECT id, '73000000-0000-4000-8000-000000000002', 'Range Probe', 1000,
 CASE order_number WHEN 'ARANGE-1' THEN 1 WHEN 'ARANGE-2' THEN 3 ELSE 9 END,
 total_cents FROM orders WHERE order_number IN ('ARANGE-1', 'ARANGE-2', 'ARANGE-3');
INSERT INTO orders (order_number, status, source, delivery_type, subtotal_cents, total_cents, created_at)
VALUES ('ARANGE-MANY', 'paid', 'counter', 'dine_in', 7800, 7800, '2082-01-01 12:00:00+00');
INSERT INTO menu_items (id, category_id, name, price_cents)
SELECT md5('analytics-range-' || n)::uuid, '73000000-0000-4000-8000-000000000001', 'Range item ' || n, 100
FROM generate_series(1, 12) n;
INSERT INTO order_items (order_id, menu_item_id, menu_item_name, menu_item_price_cents, quantity, line_total_cents)
SELECT o.id, md5('analytics-range-' || n)::uuid, 'Historical item ' || n, 100, 1, n * 100
FROM orders o CROSS JOIN generate_series(1, 12) n WHERE o.order_number = 'ARANGE-MANY';
INSERT INTO orders (order_number, status, source, delivery_type, subtotal_cents, total_cents, created_at) VALUES
 ('ARANGE-BEFORE', 'paid', 'counter', 'dine_in', 1000, 1000, '2083-01-01 15:59:59+00'),
 ('ARANGE-AFTER', 'paid', 'counter', 'dine_in', 2000, 2000, '2083-01-01 16:00:00+00');
INSERT INTO order_items (order_id, menu_item_id, menu_item_name, menu_item_price_cents, quantity, line_total_cents)
SELECT id, '73000000-0000-4000-8000-000000000002', CASE order_number WHEN 'ARANGE-BEFORE' THEN 'Old Name' ELSE 'Another Old Name' END, 1000, 1, total_cents
FROM orders WHERE order_number IN ('ARANGE-BEFORE', 'ARANGE-AFTER');
SELECT ok(NOT has_function_privilege('anon', 'public.analytics_top_items(date,date)', 'EXECUTE'), 'anon cannot execute');
SELECT ok(has_function_privilege('authenticated', 'public.analytics_top_items(date,date)', 'EXECUTE'), 'authenticated can execute');
SELECT ok(NOT has_function_privilege('anon', 'public.analytics_order_sources(date,date)', 'EXECUTE'), 'anon cannot execute order sources');
SELECT ok(has_function_privilege('authenticated', 'public.analytics_order_sources(date,date)', 'EXECUTE'), 'authenticated can execute order sources');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT is((public.analytics_top_items('2026-01-01', '2026-01-31')->>'items_sold')::bigint, 0::bigint, 'nonstaff RLS hides all items');
SELECT is(jsonb_array_length(public.analytics_order_sources('2026-01-01', '2026-01-31')), 0, 'nonstaff RLS hides order sources');
SELECT is((SELECT count(*) FROM public.analytics_daily_business_summary), 0::bigint, 'nonstaff RLS hides all daily rows');
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"admin"}}', true);
SELECT is((public.analytics_top_items('2026-01-01', '2026-01-31')->>'items_sold')::bigint, 1::bigint, 'counts only qualifying items in date range');
SELECT is((public.analytics_top_items('2026-01-01', '2026-01-31')->'top_items'->0->>'total_revenue_cents')::bigint, 1000::bigint, 'sums selected range revenue in cents');
SELECT is((public.analytics_top_items('2026-02-02', '2026-02-02')->>'items_sold')::bigint, 3::bigint, 'includes both date boundaries');
SELECT is((public.analytics_top_items('2082-01-01', '2082-01-01')->>'items_sold')::bigint, 12::bigint, 'counts all items beyond the top ten');
SELECT is(jsonb_array_length(public.analytics_top_items('2082-01-01', '2082-01-01')->'top_items'), 10, 'returns at most ten items');
SELECT is(public.analytics_top_items('2082-01-01', '2082-01-01')->'top_items'->0->>'menu_item_name', 'Range item 12', 'orders top items by revenue');
SELECT is(jsonb_array_length(public.analytics_top_items('2083-01-01', '2083-01-02')->'top_items'), 1, 'historical names with same ID are grouped');
SELECT is(public.analytics_top_items('2083-01-01', '2083-01-02')->'top_items'->0->>'menu_item_name', 'Range Probe', 'group uses current catalog name');
SELECT is((public.analytics_top_items('2083-01-01', '2083-01-02')->'top_items'->0->>'total_quantity')::bigint, 2::bigint, 'group includes both names');
SELECT is((public.analytics_top_items('2083-01-02', '2083-01-02')->>'items_sold')::bigint, 1::bigint, 'item range uses Malaysia midnight');
SELECT ok(NOT has_table_privilege('anon', 'public.analytics_daily_business_summary', 'SELECT'), 'anon cannot read daily business view');
SELECT ok(has_table_privilege('authenticated', 'public.analytics_daily_business_summary', 'SELECT'), 'authenticated can read daily business view');
SELECT is((SELECT order_count FROM public.analytics_daily_business_summary WHERE order_date = '2083-01-01'), 1::bigint, 'daily view places pre-midnight order on prior Malaysia day');
SELECT is((SELECT revenue_cents FROM public.analytics_daily_business_summary WHERE order_date = '2083-01-02'), 2000::bigint, 'daily view places midnight order on new Malaysia day');
SELECT is(public.analytics_order_sources('2026-01-01', '2026-01-31')->0->>'source', 'counter', 'order sources names the channel');
SELECT is((public.analytics_order_sources('2026-01-01', '2026-01-31')->0->>'order_count')::bigint, 1::bigint, 'order sources skip cancelled orders');
SELECT is(jsonb_array_length(public.analytics_order_sources('2082-01-01', '2082-01-01')), 1, 'order sources include paid orders');
SELECT is(jsonb_array_length(public.analytics_order_sources('2099-01-01', '2099-01-02')), 0, 'order sources are empty without sales');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
