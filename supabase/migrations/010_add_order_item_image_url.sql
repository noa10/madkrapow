-- ========================================
-- 010_add_order_item_image_url.sql
-- Adds image_url to order_items for displaying thumbnails in order tracking
-- ========================================

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS image_url TEXT;
