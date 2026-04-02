-- HubboPOS Integration Schema
-- Extends existing tables with HubboPOS source fields
-- Creates sync queue, API logs, and sync run tracking tables

-- ============================================
-- 1. Extend store_settings with HubboPOS config
-- ============================================

ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_enabled BOOLEAN DEFAULT false;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_merchant_id TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_location_id TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_sync_interval_minutes INTEGER DEFAULT 5;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_health_status TEXT DEFAULT 'unknown';
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_circuit_state TEXT DEFAULT 'closed';
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_last_sync_at TIMESTAMPTZ;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_last_catalog_sync_at TIMESTAMPTZ;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_last_order_sync_at TIMESTAMPTZ;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_last_error TEXT;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_last_error_at TIMESTAMPTZ;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS hubbo_pos_read_only_mode BOOLEAN DEFAULT false;

-- ============================================
-- 2. Extend catalog tables with HubboPOS source fields
-- ============================================

ALTER TABLE categories ADD COLUMN IF NOT EXISTS hubbo_pos_external_id TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS hubbo_pos_last_synced_at TIMESTAMPTZ;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS hubbo_pos_source TEXT DEFAULT 'local';

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS hubbo_pos_external_id TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS hubbo_pos_sku TEXT;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS hubbo_pos_last_synced_at TIMESTAMPTZ;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS hubbo_pos_source TEXT DEFAULT 'local';

ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS hubbo_pos_external_id TEXT;
ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS hubbo_pos_last_synced_at TIMESTAMPTZ;
ALTER TABLE modifier_groups ADD COLUMN IF NOT EXISTS hubbo_pos_source TEXT DEFAULT 'local';

ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS hubbo_pos_external_id TEXT;
ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS hubbo_pos_last_synced_at TIMESTAMPTZ;
ALTER TABLE modifiers ADD COLUMN IF NOT EXISTS hubbo_pos_source TEXT DEFAULT 'local';

-- Indexes for catalog sync lookups
CREATE INDEX IF NOT EXISTS idx_categories_hubbopos_external_id ON categories(hubbo_pos_external_id) WHERE hubbo_pos_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_menu_items_hubbopos_external_id ON menu_items(hubbo_pos_external_id) WHERE hubbo_pos_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modifier_groups_hubbopos_external_id ON modifier_groups(hubbo_pos_external_id) WHERE hubbo_pos_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_modifiers_hubbopos_external_id ON modifiers(hubbo_pos_external_id) WHERE hubbo_pos_external_id IS NOT NULL;

-- ============================================
-- 3. Extend orders table with HubboPOS fields
-- ============================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS hubbo_pos_trans_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hubbo_pos_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hubbo_pos_invoice_no TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hubbo_pos_sync_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hubbo_pos_payment_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hubbo_pos_last_synced_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hubbo_pos_last_error TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_hubbopos_sync_status ON orders(hubbo_pos_sync_status);
CREATE INDEX IF NOT EXISTS idx_orders_hubbopos_trans_id ON orders(hubbo_pos_trans_id) WHERE hubbo_pos_trans_id IS NOT NULL;

-- ============================================
-- 4. Create hubbopos_sync_queue table
-- ============================================

CREATE TABLE IF NOT EXISTS hubbopos_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hubbopos_queue_status ON hubbopos_sync_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_hubbopos_queue_order ON hubbopos_sync_queue(order_id);

-- ============================================
-- 5. Create hubbopos_api_logs table
-- ============================================

CREATE TABLE IF NOT EXISTS hubbopos_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  request_headers JSONB,
  request_body JSONB,
  response_status INTEGER,
  response_body JSONB,
  duration_ms INTEGER,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hubbopos_api_logs_created ON hubbopos_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hubbopos_api_logs_success ON hubbopos_api_logs(success);

-- ============================================
-- 6. Create hubbopos_sync_runs table
-- ============================================

CREATE TABLE IF NOT EXISTS hubbopos_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  catalog_synced BOOLEAN DEFAULT false,
  orders_pulled INTEGER DEFAULT 0,
  orders_pushed INTEGER DEFAULT 0,
  queue_flushed INTEGER DEFAULT 0,
  queue_failed INTEGER DEFAULT 0,
  reconciliation_snapshot JSONB,
  error_message TEXT,
  triggered_by TEXT DEFAULT 'cron'
);

CREATE INDEX IF NOT EXISTS idx_hubbopos_sync_runs_started ON hubbopos_sync_runs(started_at DESC);

-- ============================================
-- 7. Updated_at trigger for hubbopos_sync_queue
-- ============================================

CREATE OR REPLACE FUNCTION update_hubbopos_sync_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_hubbopos_sync_queue_updated_at ON hubbopos_sync_queue;
CREATE TRIGGER trigger_hubbopos_sync_queue_updated_at
  BEFORE UPDATE ON hubbopos_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_hubbopos_sync_queue_updated_at();

-- ============================================
-- 8. RLS Policies
-- ============================================

ALTER TABLE hubbopos_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubbopos_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubbopos_sync_runs ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY hubbopos_queue_service_all ON hubbopos_sync_queue FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY hubbopos_logs_service_all ON hubbopos_api_logs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY hubbopos_runs_service_all ON hubbopos_sync_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Admin read access
CREATE POLICY hubbopos_queue_admin_read ON hubbopos_sync_queue FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY hubbopos_logs_admin_read ON hubbopos_api_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY hubbopos_runs_admin_read ON hubbopos_sync_runs FOR SELECT
  USING (auth.uid() IS NOT NULL);
