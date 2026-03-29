-- ========================================
-- 009_enable_bulk_orders.sql
-- Sets bulk_enabled to true in store_settings
-- ========================================

UPDATE store_settings
SET bulk_enabled = true;
