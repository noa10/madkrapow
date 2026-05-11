-- ============================================
-- 044: Bot Sessions Table
-- ============================================
-- Stores per-user conversation state for Telegram and WhatsApp bots.
-- Enables cart building, address collection, and multi-step ordering
-- within a chat session.

BEGIN;

-- 1. Create bot_sessions table
CREATE TABLE bot_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL CHECK (platform IN ('telegram', 'whatsapp')),
    platform_user_id TEXT NOT NULL,
    current_state TEXT NOT NULL DEFAULT 'idle',
    cart_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    address_json JSONB,
    contact_json JSONB,
    selected_item_id UUID,
    selected_modifier_group_index INTEGER,
    language TEXT NOT NULL DEFAULT 'en',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one session per platform + user
    UNIQUE (platform, platform_user_id)
);

-- 2. Trigger for updated_at
CREATE TRIGGER update_bot_sessions_updated_at
  BEFORE UPDATE ON bot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 3. Index for state-based queries (e.g., abandoned carts)
CREATE INDEX idx_bot_sessions_current_state ON bot_sessions(current_state);

-- 4. Index for last interaction (cleanup / analytics)
CREATE INDEX idx_bot_sessions_last_interaction ON bot_sessions(last_interaction_at);

-- 5. Enable RLS
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

-- 6. Service role bypass (bot backend uses service_role key)
CREATE POLICY "service_role_all_bot_sessions"
  ON bot_sessions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 7. Add FK from orders to bot_sessions (orders.bot_session_id created in 043)
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_bot_session
    FOREIGN KEY (bot_session_id)
    REFERENCES bot_sessions(id)
    ON DELETE SET NULL;

-- 8. Comments for documentation
COMMENT ON TABLE bot_sessions IS 'Conversational state for Telegram/WhatsApp bot users.';
COMMENT ON COLUMN bot_sessions.platform IS 'Messaging platform: telegram or whatsapp.';
COMMENT ON COLUMN bot_sessions.platform_user_id IS 'Platform-native user identifier (Telegram user ID or WhatsApp phone).';
COMMENT ON COLUMN bot_sessions.current_state IS 'FSM state: idle, browsing, cart, address, checkout, etc.';
COMMENT ON COLUMN bot_sessions.cart_json IS 'Serialized cart items (array of {menu_item_id, quantity, modifiers, notes}).';
COMMENT ON COLUMN bot_sessions.address_json IS 'Collected delivery address during bot flow.';
COMMENT ON COLUMN bot_sessions.contact_json IS 'Collected contact info (name, phone) during bot flow.';
COMMENT ON COLUMN bot_sessions.selected_item_id IS 'Currently selected menu item in browse flow.';
COMMENT ON COLUMN bot_sessions.selected_modifier_group_index IS 'Index of modifier group being answered.';
COMMENT ON COLUMN bot_sessions.language IS 'User language preference for bot messages (ISO 639-1).';
COMMENT ON COLUMN bot_sessions.last_interaction_at IS 'Timestamp of last user message — used for session timeout/cleanup.';

COMMIT;
