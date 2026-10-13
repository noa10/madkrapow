-- ============================================
-- 048: Fix stale analytics views
-- ============================================
-- 031 filtered on statuses ('paid','preparing','ready','delivering','completed'),
-- but 'delivering'/'completed' are not in the live orders.status CHECK (migration 008:
-- pending, paid, accepted, preparing, ready, picked_up, delivered, cancelled).
-- Net effect: every delivered order — the bulk of real sales — was silently excluded.
--
-- The valid "counted as a sale" set is everything except pending (not yet paid) and
-- cancelled (never became a sale). Refunds are not modelled as statuses; once a refunds
-- table exists (049), reporting should net refunds separately rather than dropping orders.

-- 1. daily_order_summary — same shape as before (one row per date), fixed status filter.
CREATE OR REPLACE VIEW daily_order_summary AS
SELECT
    DATE(created_at) AS order_date,
    COUNT(*) AS order_count,
    SUM(total_cents) AS revenue_cents,
    AVG(total_cents) AS avg_order_cents,
    SUM(subtotal_cents) AS subtotal_cents,
    SUM(delivery_fee_cents) AS delivery_fees_cents,
    SUM(discount_cents) AS discounts_cents,
    COUNT(CASE WHEN delivery_type = 'delivery' THEN 1 END) AS delivery_count,
    COUNT(CASE WHEN delivery_type = 'self_pickup' THEN 1 END) AS pickup_count
FROM orders
WHERE status IN ('paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered')
GROUP BY DATE(created_at)
ORDER BY order_date DESC;

-- 2. top_selling_items — same shape, fixed status filter.
CREATE OR REPLACE VIEW top_selling_items AS
SELECT
    oi.menu_item_name,
    oi.menu_item_id,
    SUM(oi.quantity) AS total_quantity,
    SUM(oi.line_total_cents) AS total_revenue_cents
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status IN ('paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered')
GROUP BY oi.menu_item_name, oi.menu_item_id
ORDER BY total_revenue_cents DESC;

-- 3. New: per-day per-sales-channel breakdown (source column added in 043).
--    Consumed by the admin analytics page alongside daily_order_summary.
CREATE OR REPLACE VIEW daily_channel_summary AS
SELECT
    DATE(created_at) AS order_date,
    source AS channel,
    COUNT(*) AS order_count,
    SUM(total_cents) AS revenue_cents,
    SUM(discount_cents) AS discounts_cents
FROM orders
WHERE status IN ('paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered')
GROUP BY DATE(created_at), source
ORDER BY order_date DESC, channel ASC;
