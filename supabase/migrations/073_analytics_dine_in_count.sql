-- ============================================
-- 073: Add dine-in to the daily analytics buckets
-- ============================================
-- 048 predates the dine-in delivery type. Its order_count included dine-in
-- sales while delivery_count + pickup_count omitted them, so the buckets did
-- not reconcile. Preserve the existing columns and add the third bucket, using
-- CREATE OR REPLACE because the existing view's column order is unchanged and
-- the new column is appended.

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
    COUNT(CASE WHEN delivery_type = 'self_pickup' THEN 1 END) AS pickup_count,
    COUNT(CASE WHEN delivery_type = 'dine_in' THEN 1 END) AS dine_in_count
FROM orders
WHERE status IN ('paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered')
GROUP BY DATE(created_at)
ORDER BY order_date DESC;
