-- ============================================
-- 045: Store Bot Configuration
-- ============================================
-- Adds bot-related settings to store_settings for Telegram/WhatsApp
-- integration and delivery geofencing.

BEGIN;

-- 1. Delivery geofence (polygon or list of allowed areas)
ALTER TABLE store_settings
  ADD COLUMN delivery_geofence_json JSONB;

-- 2. Telegram kitchen group chat ID for order notifications
ALTER TABLE store_settings
  ADD COLUMN telegram_kitchen_group_chat_id TEXT;

-- 3. Bot enablement flags
ALTER TABLE store_settings
  ADD COLUMN telegram_bot_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN whatsapp_bot_enabled BOOLEAN NOT NULL DEFAULT false;

-- 4. Comments for documentation
COMMENT ON COLUMN store_settings.delivery_geofence_json IS 'GeoJSON polygon or array of allowed delivery zones. NULL = no geofence restriction.';
COMMENT ON COLUMN store_settings.telegram_kitchen_group_chat_id IS 'Telegram chat ID for kitchen order notifications. Required when telegram_bot_enabled is true.';
COMMENT ON COLUMN store_settings.telegram_bot_enabled IS 'Whether the Telegram ordering bot is active.';
COMMENT ON COLUMN store_settings.whatsapp_bot_enabled IS 'Whether the WhatsApp ordering bot is active.';

COMMIT;
