-- ========================================
-- 012_enable_realtime.sql
-- Enables Realtime on the orders table so that
-- postgres_changes subscriptions receive UPDATE events.
-- Required for the order tracking page to get live status updates.
-- ========================================

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
