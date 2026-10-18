-- ============================================
-- 054: composite indexes for admin order queries
-- ============================================
-- The admin orders dashboard/tabs and their counters all filter by
-- fulfillment_type / status / order_kind and order by created_at DESC. These
-- additive composite indexes let those plans use an index for both the filter
-- and the sort instead of scanning/sorting the orders table.
--
--   idx_orders_fulfillment_created_at
--     → today-ASAP range scans (fulfillment_type = 'asap' + created_at window)
--       and the scheduled tab (fulfillment_type = 'scheduled' ORDER BY created_at).
--
--   idx_orders_fulfillment_status_created_at
--     → preparing/ready tab queries and counts
--       (fulfillment_type = ... AND status IN (...), newest first).
--
--   idx_orders_status_created_at
--     → history tab range + status filters
--       (status IN (...) AND created_at window, newest first).
--
--   idx_orders_order_kind_created_at
--     → upcoming (bulk) tab (order_kind = 'bulk' ORDER BY created_at DESC).
--
-- Plain CREATE INDEX (no CONCURRENTLY): migrations run inside a transaction.
-- Additive only — no existing index or column is changed or dropped.

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_created_at
    ON orders (fulfillment_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status_created_at
    ON orders (fulfillment_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
    ON orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_order_kind_created_at
    ON orders (order_kind, created_at DESC);
