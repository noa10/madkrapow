-- ============================================
-- 034: Cutlery Preference
-- ============================================
-- Adds include_cutlery to orders so customers can opt out of cutlery.
-- Adds cutlery_enabled / cutlery_default to store_settings for restaurant-level config.
-- Default: include_cutlery = true (cutlery included), cutlery_enabled = true (feature on), cutlery_default = true (default to include).
-- Existing orders: include_cutlery defaults to true, preserving existing behavior (no breaking change).

-- 1. Add include_cutlery to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS include_cutlery BOOLEAN NOT NULL DEFAULT true;

-- 2. Add cutlery config to store_settings
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS cutlery_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS cutlery_default BOOLEAN NOT NULL DEFAULT true;

-- 3. Add comment for documentation
COMMENT ON COLUMN orders.include_cutlery IS 'Whether the customer wants cutlery included. Defaults to true for backward compatibility.';
COMMENT ON COLUMN store_settings.cutlery_enabled IS 'Whether the cutlery preference toggle is shown to customers. When false, the field is ignored on checkout.';
COMMENT ON COLUMN store_settings.cutlery_default IS 'Default cutlery preference when customer does not specify. Used when cutlery_enabled is true.';
