-- ============================================
-- 049: Canonical multi-channel order model
-- ============================================
-- Makes MadKrapow the single source of truth for orders from every sales channel
-- (web, bots, mobile, counter POS, GrabFood, Foodpanda):
--
--   * Widens orders.source with 'counter', 'grabfood', 'foodpanda'.
--   * payments / refunds      — money movement is a first-class record (legacy POS
--                               exported refunds as separate negative orders; those
--                               become refunds linked to their original order).
--   * channel_orders          — external platform identity per order. The
--                               UNIQUE(channel, external_order_id) constraint is the
--                               webhook idempotency anchor.
--   * channel_products        — per-channel menu mapping + channel-specific pricing
--                               (counter RM10 vs GrabFood RM13), replacing the
--                               vendor-prefixed hubbo_pos_* column pattern for new
--                               integrations.
--   * integration_events      — provider-agnostic webhook event log (template:
--                               lalamove_webhook_events).
--   * legacy_import_batches / legacy_import_records — audit trail for the legacy
--                               Aliments POS JSON import.
--
-- No orders.status changes: Grab's lifecycle maps onto the existing 8-status machine
-- (submit-order arrives as 'paid' → preparing → ready → picked_up → delivered).

BEGIN;

-- ========================================
-- PART A: Widen orders.source
-- ========================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check CHECK (
  source IN ('web', 'telegram', 'whatsapp', 'mobile', 'counter', 'grabfood', 'foodpanda')
);

COMMENT ON COLUMN orders.source IS
  'Sales channel where the order was placed: web, telegram, whatsapp, mobile, counter, grabfood, or foodpanda.';

-- ========================================
-- PART B: payments
-- ========================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('stripe', 'cash', 'qr_pay', 'grabfood', 'foodpanda', 'other')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'MYR',
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  external_ref TEXT,
  paid_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One payment per external reference (e.g. Stripe payment_intent) — webhook-safe upserts.
CREATE UNIQUE INDEX payments_external_ref_unique
  ON payments (external_ref) WHERE external_ref IS NOT NULL;

CREATE INDEX idx_payments_order_id ON payments(order_id);

-- ========================================
-- PART C: refunds
-- ========================================
CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT,
  external_ref TEXT,
  refunded_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_order_id ON refunds(order_id);
CREATE INDEX idx_refunds_payment_id ON refunds(payment_id) WHERE payment_id IS NOT NULL;

-- ========================================
-- PART D: channel_orders
-- ========================================
CREATE TABLE channel_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('grabfood', 'foodpanda', 'legacy_pos')),
  external_order_id TEXT NOT NULL,
  external_order_number TEXT,
  external_store_id TEXT,
  external_status TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency anchor: the same external order can only ever map to one local order.
  CONSTRAINT channel_orders_channel_external_unique UNIQUE (channel, external_order_id)
);

CREATE INDEX idx_channel_orders_order_id ON channel_orders(order_id);
CREATE INDEX idx_channel_orders_external_order_number
  ON channel_orders(external_order_number) WHERE external_order_number IS NOT NULL;

-- ========================================
-- PART E: channel_products
-- ========================================
CREATE TABLE channel_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('grabfood', 'foodpanda')),
  external_item_id TEXT,
  external_name TEXT,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  is_available BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One mapping per product per channel (the local product is the master).
  CONSTRAINT channel_products_channel_item_unique UNIQUE (channel, menu_item_id)
);

-- External ids are optional (a product can exist locally before Grab assigns an id),
-- so uniqueness is enforced only where an id exists.
CREATE UNIQUE INDEX channel_products_channel_external_unique
  ON channel_products(channel, external_item_id) WHERE external_item_id IS NOT NULL;

CREATE INDEX idx_channel_products_menu_item_id ON channel_products(menu_item_id);

CREATE TRIGGER set_channel_products_updated_at
  BEFORE UPDATE ON channel_products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- PART F: integration_events
-- ========================================
CREATE TABLE integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  external_event_id TEXT,
  external_order_id TEXT,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'failed', 'skipped')),
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Duplicate delivery of the same provider event is deduplicated on this key;
-- handlers catch the unique violation and ack. Events without an external id
-- are logged but not deduplicated (handler-level dedupe applies).
CREATE UNIQUE INDEX integration_events_dedupe_unique
  ON integration_events(provider, event_type, external_event_id)
  WHERE external_event_id IS NOT NULL;

CREATE INDEX idx_integration_events_external_order_id
  ON integration_events(external_order_id) WHERE external_order_id IS NOT NULL;
CREATE INDEX idx_integration_events_received_at ON integration_events(received_at);

-- ========================================
-- PART G: legacy import audit tables
-- ========================================
CREATE TABLE legacy_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'aliments_pos',
  outlet_name TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  summary JSONB
);

CREATE TABLE legacy_import_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES legacy_import_batches(id) ON DELETE CASCADE,
  legacy_order_group TEXT,
  legacy_system_id TEXT,
  legacy_invoice_no TEXT,
  record_type TEXT,
  raw JSONB NOT NULL,
  mapped_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  import_status TEXT NOT NULL CHECK (import_status IN ('imported', 'skipped', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legacy_import_records_batch_id ON legacy_import_records(batch_id);
CREATE INDEX idx_legacy_import_records_system_id
  ON legacy_import_records(legacy_system_id) WHERE legacy_system_id IS NOT NULL;
CREATE INDEX idx_legacy_import_records_mapped_order_id
  ON legacy_import_records(mapped_order_id) WHERE mapped_order_id IS NOT NULL;

-- ========================================
-- PART H: updated_at triggers
-- ========================================
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_channel_orders_updated_at
  BEFORE UPDATE ON channel_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- PART I: RLS
-- ========================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_import_records ENABLE ROW LEVEL SECURITY;

-- Service role: full access everywhere (webhook handlers, import scripts, cron).
CREATE POLICY "service_role_all_payments" ON payments
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_refunds" ON refunds
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_channel_orders" ON channel_orders
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_channel_products" ON channel_products
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_integration_events" ON integration_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_legacy_import_batches" ON legacy_import_batches
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "service_role_all_legacy_import_records" ON legacy_import_records
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Staff: read money-movement + channel identity (same role set as staff_all_orders).
CREATE POLICY "staff_select_payments" ON payments
  FOR SELECT USING (
    auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'manager', 'cashier', 'kitchen')
  );
CREATE POLICY "staff_select_refunds" ON refunds
  FOR SELECT USING (
    auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'manager', 'cashier', 'kitchen')
  );
CREATE POLICY "staff_select_channel_orders" ON channel_orders
  FOR SELECT USING (
    auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'manager', 'cashier', 'kitchen')
  );

-- Channel product mapping is catalog-adjacent: admin/manager manage it.
CREATE POLICY "admin_manager_all_channel_products" ON channel_products
  FOR ALL USING (is_admin_or_manager());

-- Integration events + legacy audit: admin/manager read-only (service role writes).
CREATE POLICY "admin_manager_select_integration_events" ON integration_events
  FOR SELECT USING (is_admin_or_manager());
CREATE POLICY "admin_manager_select_legacy_import_batches" ON legacy_import_batches
  FOR SELECT USING (is_admin_or_manager());
CREATE POLICY "admin_manager_select_legacy_import_records" ON legacy_import_records
  FOR SELECT USING (is_admin_or_manager());

-- Customers: read payment/refund/channel info for their own orders
-- (same ownership pattern as auth_select_own_shipments).
CREATE POLICY "auth_select_own_payments" ON payments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.id = payments.order_id
      AND c.auth_user_id = auth.uid()
  )
);
CREATE POLICY "auth_select_own_refunds" ON refunds FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.id = refunds.order_id
      AND c.auth_user_id = auth.uid()
  )
);
CREATE POLICY "auth_select_own_channel_orders" ON channel_orders FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.id = channel_orders.order_id
      AND c.auth_user_id = auth.uid()
  )
);

COMMIT;
