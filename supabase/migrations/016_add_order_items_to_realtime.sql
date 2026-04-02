-- ========================================
-- 016_add_order_items_to_realtime.sql
-- Adds order_items table to Realtime publication
-- so that the order tracking page can receive
-- INSERT events when items are added.
-- ========================================

ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
