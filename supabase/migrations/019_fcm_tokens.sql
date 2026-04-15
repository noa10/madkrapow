-- ========================================
-- 019_fcm_tokens.sql
-- Creates fcm_tokens table for push notification delivery.
-- Per-device tokens, UNIQUE(user_id, device_id).
-- RLS: admins manage own tokens, service_role reads all.
-- ========================================

CREATE TABLE fcm_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One token per user+device combination
  UNIQUE(user_id, device_id)
);

-- Index for looking up tokens by user (used by Edge Function)
CREATE INDEX idx_fcm_tokens_user_id ON fcm_tokens(user_id);

-- Index for finding stale/invalid tokens during cleanup
CREATE INDEX idx_fcm_tokens_token ON fcm_tokens(token);

-- RLS
ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Admins can manage their own FCM tokens
CREATE POLICY "admin_manage_own_fcm_tokens" ON fcm_tokens FOR ALL USING (
  auth.uid() = user_id
  AND auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- Service role can read all tokens (for Edge Function to send pushes)
CREATE POLICY "service_role_read_fcm_tokens" ON fcm_tokens FOR SELECT USING (
  auth.jwt() ->> 'role' = 'service_role'
);

-- Auto-update updated_at on change
CREATE OR REPLACE FUNCTION update_fcm_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_fcm_tokens_updated_at
  BEFORE UPDATE ON fcm_tokens
  FOR EACH ROW EXECUTE FUNCTION update_fcm_tokens_updated_at();
