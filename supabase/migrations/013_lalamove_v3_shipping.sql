-- ========================================
-- 013_lalamove_v3_shipping.sql
-- Creates lalamove_shipments and lalamove_webhook_events tables
-- for the v3 shipping integration.
-- ========================================

-- ========================================
-- PART A: Extend orders.dispatch_status constraint
-- ========================================
-- Drop old constraint and add new one with all v3 dispatch statuses.
-- Keeps existing values for backward compatibility.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_dispatch_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_dispatch_status_check CHECK (
  dispatch_status IN (
    'not_ready',       -- order not yet ready for dispatch
    'queued',          -- scheduled order, waiting for dispatch_after
    'submitted',       -- legacy: order submitted to Lalamove
    'failed',          -- dispatch or delivery failed
    'quoted',          -- quotation obtained, not yet dispatched
    'driver_pending',  -- Lalamove is assigning a driver
    'driver_assigned', -- driver has been assigned
    'in_transit',      -- driver has picked up the order
    'delivered',       -- order delivered successfully
    'cancelled',       -- delivery was cancelled
    'manual_review'    -- needs manual intervention (REJECTED/EXPIRED)
  )
);

-- ========================================
-- PART B: lalamove_shipments table
-- ========================================
-- Source of truth for all Lalamove shipping state.
-- One row per delivery attempt (supports retry creating new rows).
CREATE TABLE lalamove_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  -- Lalamove identifiers
  quotation_id TEXT NOT NULL,
  lalamove_order_id TEXT,

  -- Service configuration
  service_type TEXT NOT NULL, -- MOTORCYCLE, CAR

  -- Shipment lifecycle status
  dispatch_status TEXT NOT NULL DEFAULT 'quoted'
    CHECK (dispatch_status IN (
      'quoted', 'driver_pending', 'driver_assigned',
      'in_transit', 'delivered', 'failed',
      'cancelled', 'manual_review'
    )),

  -- Customer-facing tracking
  share_link TEXT,

  -- Pricing (all in cents for precision)
  quoted_fee_cents INTEGER NOT NULL,
  actual_fee_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'MYR',

  -- Sender/recipient snapshots (JSONB for flexibility)
  sender_json JSONB NOT NULL,
  recipient_json JSONB NOT NULL,

  -- Stop IDs from quotation (for re-dispatch without re-quoting)
  stop_ids JSONB,

  -- Quotation lifecycle
  quote_expires_at TIMESTAMPTZ,
  schedule_at TIMESTAMPTZ,

  -- Driver information (populated on DRIVER_ASSIGNED webhook)
  driver_name TEXT,
  driver_phone TEXT,
  driver_plate TEXT,
  driver_photo_url TEXT,
  driver_latitude DOUBLE PRECISION,
  driver_longitude DOUBLE PRECISION,
  driver_location_updated_at TIMESTAMPTZ,

  -- Cancellation
  cancellation_reason TEXT,

  -- Raw API responses for debugging
  raw_order_response JSONB,
  raw_webhook_payload JSONB,

  -- Lifecycle timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);

-- ========================================
-- PART C: lalamove_webhook_events table
-- ========================================
-- Audit log and idempotency table for Lalamove webhooks.
-- Stores raw payloads and prevents duplicate processing.
CREATE TABLE lalamove_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event identification
  lalamove_order_id TEXT NOT NULL,
  event_type TEXT NOT NULL,       -- ORDER_STATUS_CHANGED, DRIVER_ASSIGNED, etc.
  event_status TEXT,              -- the status from the payload

  -- Raw payload for debugging/replay
  raw_payload JSONB NOT NULL,

  -- Signature verification audit
  signature TEXT,

  -- Processing state
  processed BOOLEAN NOT NULL DEFAULT false,
  processing_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- PART D: Indexes
-- ========================================

-- Shipment lookups by order
CREATE INDEX idx_shipments_order_id ON lalamove_shipments(order_id);

-- Fast lookup by Lalamove order ID (for webhook processing)
CREATE INDEX idx_shipments_lalamove_order_id
  ON lalamove_shipments(lalamove_order_id)
  WHERE lalamove_order_id IS NOT NULL;

-- Filter by dispatch status (for admin dashboards, cron jobs)
CREATE INDEX idx_shipments_dispatch_status
  ON lalamove_shipments(dispatch_status);

-- Webhook event lookups
CREATE INDEX idx_webhook_events_order_id
  ON lalamove_webhook_events(lalamove_order_id);

-- Idempotency: prevent duplicate webhook processing
CREATE UNIQUE INDEX idx_webhook_events_idempotency
  ON lalamove_webhook_events(lalamove_order_id, event_type, created_at);

-- Driver location polling (active deliveries only)
CREATE INDEX idx_shipments_driver_location
  ON lalamove_shipments(driver_latitude, driver_longitude)
  WHERE dispatch_status = 'in_transit';

-- ========================================
-- PART E: Updated-at trigger
-- ========================================
CREATE TRIGGER update_lalamove_shipments_updated_at
  BEFORE UPDATE ON lalamove_shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- PART F: Row Level Security
-- ========================================
ALTER TABLE lalamove_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lalamove_webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role: full access (used by webhooks, cron, API routes)
CREATE POLICY "service_role_all_shipments" ON lalamove_shipments
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "service_role_all_webhook_events" ON lalamove_webhook_events
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Authenticated users: read their own shipments (via order ownership)
CREATE POLICY "auth_select_own_shipments" ON lalamove_shipments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.id = lalamove_shipments.order_id
      AND c.auth_user_id = auth.uid()
  )
);

-- Admin users: full read access to shipments (via admin role check)
CREATE POLICY "admin_select_all_shipments" ON lalamove_shipments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.auth_user_id = auth.uid()
      AND (auth.jwt() ->> 'role' = 'service_role'
        OR auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
  )
);

-- ========================================
-- PART G: Realtime subscriptions
-- ========================================
-- Enable Realtime on lalamove_shipments for live tracking
ALTER PUBLICATION supabase_realtime ADD TABLE lalamove_shipments;

-- ========================================
-- PART H: Comments for documentation
-- ========================================
COMMENT ON TABLE lalamove_shipments IS
  'Lalamove v3 shipment records. Source of truth for delivery state.';

COMMENT ON TABLE lalamove_webhook_events IS
  'Audit log and idempotency table for Lalamove v3 webhook events.';

COMMENT ON COLUMN lalamove_shipments.dispatch_status IS
  'Internal shipment status mapped from Lalamove v3 order status.';

COMMENT ON COLUMN lalamove_shipments.quotation_id IS
  'Lalamove v3 quotation ID. Quotations are valid for 5 minutes.';

COMMENT ON COLUMN lalamove_shipments.stop_ids IS
  'JSONB with pickup and dropoff stop IDs from the quotation. Format: {"pickup": "id", "dropoff": "id"}';
