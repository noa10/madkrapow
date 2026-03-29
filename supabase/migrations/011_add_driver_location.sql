-- ========================================
-- 011_add_driver_location.sql
-- Adds driver GPS tracking columns to orders table
-- For future integration with delivery partner GPS updates
-- ========================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_latitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_longitude DOUBLE PRECISION;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS driver_location_updated_at TIMESTAMPTZ;

-- Index for efficient location queries (future use)
CREATE INDEX IF NOT EXISTS idx_orders_driver_location ON orders(driver_latitude, driver_longitude)
  WHERE driver_latitude IS NOT NULL AND driver_longitude IS NOT NULL;
