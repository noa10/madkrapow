-- ============================================
-- 043: Order Source & Bot Session Link
-- ============================================
-- Tracks where each order originated (web, telegram, whatsapp, mobile)
-- and links orders to bot sessions for conversational context.
-- bot_session_id FK is added in migration 044 after bot_sessions exists.

BEGIN;

-- 1. Add order source with safe default for existing rows
ALTER TABLE orders
  ADD COLUMN source TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'telegram', 'whatsapp', 'mobile'));

-- 2. Add bot session reference (FK added in 044_bot_sessions)
ALTER TABLE orders
  ADD COLUMN bot_session_id UUID;

-- 3. Index for filtering orders by source
CREATE INDEX idx_orders_source ON orders(source);

-- 4. Index for bot session lookups
CREATE INDEX idx_orders_bot_session_id ON orders(bot_session_id) WHERE bot_session_id IS NOT NULL;

-- 5. Comments for documentation
COMMENT ON COLUMN orders.source IS 'Channel where the order was placed: web, telegram, whatsapp, or mobile.';
COMMENT ON COLUMN orders.bot_session_id IS 'Links to bot_sessions for conversational bot orders. FK added in migration 044.';

COMMIT;
