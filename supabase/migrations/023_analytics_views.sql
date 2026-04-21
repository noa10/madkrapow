-- Analytics views for server-side aggregation
-- Used by the merchant app analytics dashboard and the web API route

-- Daily order summary view
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

-- Top selling items view
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
