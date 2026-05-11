-- ============================================
-- 042: Bot Customer Support
-- ============================================
-- Makes customers table support bot users (Telegram, WhatsApp)
-- in addition to web/mobile auth users.
-- Does NOT modify existing data or existing RLS policies for web/mobile.

BEGIN;

-- 1. Allow bot customers without an auth_user_id
ALTER TABLE customers
  ALTER COLUMN auth_user_id DROP NOT NULL;

-- 2. Add platform-specific identifiers
ALTER TABLE customers
  ADD COLUMN telegram_id TEXT UNIQUE,
  ADD COLUMN whatsapp_id TEXT UNIQUE;

-- 3. Enforce at least one authentication method per customer
ALTER TABLE customers
  ADD CONSTRAINT customers_auth_method_check
    CHECK (
      auth_user_id IS NOT NULL
      OR telegram_id IS NOT NULL
      OR whatsapp_id IS NOT NULL
    );

-- 4. Indexes for bot lookups
CREATE INDEX idx_customers_telegram_id ON customers(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX idx_customers_whatsapp_id ON customers(whatsapp_id) WHERE whatsapp_id IS NOT NULL;

-- 5. Comments for documentation
COMMENT ON COLUMN customers.auth_user_id IS 'Supabase Auth UUID. NULL for bot customers (Telegram/WhatsApp).';
COMMENT ON COLUMN customers.telegram_id IS 'Telegram user ID. Unique per Telegram user.';
COMMENT ON COLUMN customers.whatsapp_id IS 'WhatsApp user ID (phone number or WA business ID). Unique per WhatsApp user.';

COMMIT;
