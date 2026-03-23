-- ========================================
-- 008_scheduled_bulk_orders.sql
-- Adds: delivery_type, scheduling, bulk orders, order_events
-- ========================================

-- ========================================
-- PART A: Fix status constraint to match UI
-- ========================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('pending', 'paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled')
);

-- ========================================
-- PART B: Delivery type (delivery vs self-pickup)
-- ========================================
ALTER TABLE orders ADD COLUMN delivery_type TEXT 
  NOT NULL DEFAULT 'delivery' CHECK (delivery_type IN ('delivery', 'self_pickup'));

-- ========================================
-- PART C: Scheduling columns
-- ========================================
ALTER TABLE orders ADD COLUMN fulfillment_type TEXT 
  NOT NULL DEFAULT 'asap' CHECK (fulfillment_type IN ('asap', 'scheduled'));

ALTER TABLE orders ADD COLUMN scheduled_for TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN requested_window_start TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN requested_window_end TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN dispatch_after TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN dispatch_status TEXT 
  DEFAULT 'not_ready' CHECK (dispatch_status IN ('not_ready', 'queued', 'submitted', 'failed'));
ALTER TABLE orders ADD COLUMN kitchen_lead_minutes INTEGER DEFAULT 20;
ALTER TABLE orders ADD COLUMN scheduled_notes TEXT;
ALTER TABLE orders ADD COLUMN rescheduled_from UUID REFERENCES orders(id);

-- ========================================
-- PART D: Bulk order columns
-- ========================================
ALTER TABLE orders ADD COLUMN order_kind TEXT 
  NOT NULL DEFAULT 'standard' CHECK (order_kind IN ('standard', 'bulk'));

ALTER TABLE orders ADD COLUMN requires_manual_review BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN approval_status TEXT 
  DEFAULT 'auto_approved' CHECK (approval_status IN ('pending_review', 'approved', 'rejected', 'auto_approved'));
ALTER TABLE orders ADD COLUMN approved_total_cents INTEGER;
ALTER TABLE orders ADD COLUMN review_notes TEXT;
ALTER TABLE orders ADD COLUMN bulk_company_name TEXT;
ALTER TABLE orders ADD COLUMN bulk_headcount INTEGER;
ALTER TABLE orders ADD COLUMN bulk_requested_date TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN bulk_budget_cents INTEGER;
ALTER TABLE orders ADD COLUMN bulk_invoice_name TEXT;
ALTER TABLE orders ADD COLUMN bulk_contact_phone TEXT;
ALTER TABLE orders ADD COLUMN bulk_special_notes TEXT;
ALTER TABLE orders ADD COLUMN bulk_dropoff_instructions TEXT;

-- ========================================
-- PART E: Bulk + pickup settings in store_settings
-- ========================================
ALTER TABLE store_settings ADD COLUMN bulk_threshold_cents INTEGER DEFAULT 15000;
ALTER TABLE store_settings ADD COLUMN bulk_min_notice_hours INTEGER DEFAULT 48;
ALTER TABLE store_settings ADD COLUMN bulk_max_items_per_slot INTEGER DEFAULT 20;
ALTER TABLE store_settings ADD COLUMN bulk_extra_prep_minutes INTEGER DEFAULT 30;
ALTER TABLE store_settings ADD COLUMN bulk_delivery_fee_cents INTEGER DEFAULT 0;
ALTER TABLE store_settings ADD COLUMN bulk_packaging_fee_cents INTEGER DEFAULT 0;
ALTER TABLE store_settings ADD COLUMN bulk_enabled BOOLEAN DEFAULT false;
ALTER TABLE store_settings ADD COLUMN pickup_enabled BOOLEAN DEFAULT true;
ALTER TABLE store_settings ADD COLUMN kitchen_lead_minutes INTEGER DEFAULT 20;

-- ========================================
-- PART F: Order events audit table
-- ========================================
CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========================================
-- PART G: Indexes
-- ========================================
CREATE INDEX idx_orders_dispatch_after ON orders(dispatch_after) 
  WHERE dispatch_status = 'queued' AND status = 'paid';
CREATE INDEX idx_orders_fulfillment_type ON orders(fulfillment_type);
CREATE INDEX idx_orders_approval_status ON orders(approval_status) 
  WHERE order_kind = 'bulk';
CREATE INDEX idx_order_events_order_id ON order_events(order_id);

-- ========================================
-- PART H: RLS for order_events
-- ========================================
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_order_events" ON order_events 
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "auth_select_own_order_events" ON order_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.id = order_events.order_id AND c.auth_user_id = auth.uid()
  )
);
