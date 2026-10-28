-- ============================================
-- 057: POS dine-in tables + table-QR ordering
-- ============================================
-- Adds the restaurant floor model used by the counter POS and by customers
-- ordering from a table QR code:
--
--   * restaurant_tables — the physical floor (label, zone, seats) plus an
--     opaque qr_token. Tokens are resolved server-side only; there is no
--     anonymous SELECT policy, so PostgREST cannot enumerate them.
--   * orders.delivery_type gains 'dine_in' (the print layer already knew the
--     label — see lib/printing/order-loader.ts).
--   * orders.table_id / table_label / pax — table_label is a snapshot so a
--     receipt still reads correctly after the table is renamed/deleted.
--
-- Dine-in uses the existing 8-status machine: staff-keyed orders are 'paid';
-- table-QR orders start 'pending' (pay at the counter) and settle to 'paid';
-- closing a table moves ready orders to 'picked_up'. No new statuses.
--
-- Idempotent: safe to re-run if a previous attempt failed halfway.

BEGIN;

-- ========================================
-- PART A: restaurant_tables
-- ========================================
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  zone TEXT,
  seats INTEGER NOT NULL DEFAULT 2 CHECK (seats BETWEEN 1 AND 50),
  -- 16 random bytes as hex: unguessable and URL-safe. Rotating this value
  -- invalidates every previously printed QR for the table.
  qr_token TEXT NOT NULL UNIQUE
    DEFAULT replace(gen_random_uuid()::text, '-', ''),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT restaurant_tables_label_unique UNIQUE (label)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_sort
  ON restaurant_tables (sort_order, label);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_active
  ON restaurant_tables (is_active) WHERE is_active;

DROP TRIGGER IF EXISTS set_restaurant_tables_updated_at ON restaurant_tables;
CREATE TRIGGER set_restaurant_tables_updated_at
  BEFORE UPDATE ON restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE restaurant_tables IS
  'Physical restaurant tables for dine-in POS and table-QR ordering.';
COMMENT ON COLUMN restaurant_tables.qr_token IS
  'Opaque capability token encoded in the table QR. Server-side resolution only.';

-- ========================================
-- PART B: widen orders.delivery_type
-- ========================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_type_check CHECK (
  delivery_type IN ('delivery', 'self_pickup', 'dine_in')
);

-- ========================================
-- PART C: orders dine-in columns
-- ========================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS table_id UUID
    REFERENCES restaurant_tables(id) ON DELETE SET NULL;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS table_label TEXT;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pax INTEGER
    CHECK (pax IS NULL OR (pax >= 1 AND pax <= 50));

-- Payment-method snapshot for list surfaces. The `payments` table remains the
-- ledger/source of truth; this column lets admin cards show "Cash"/"QR Pay"
-- without joining payments (the POS and settle paths write it).
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (
      payment_method IS NULL
      OR payment_method IN (
        'stripe', 'billplz', 'cash', 'qr_pay', 'grabfood', 'foodpanda', 'other'
      )
    );

CREATE INDEX IF NOT EXISTS idx_orders_table_id
  ON orders (table_id) WHERE table_id IS NOT NULL;

-- The table board and close-table flow read only open dine-in orders.
CREATE INDEX IF NOT EXISTS idx_orders_dine_in_open
  ON orders (table_id, status)
  WHERE delivery_type = 'dine_in'
    AND status IN ('pending', 'paid', 'accepted', 'preparing', 'ready');

-- Supports the per-table rate-limit count inside the insert trigger.
CREATE INDEX IF NOT EXISTS idx_orders_table_qr_rate
  ON orders (table_id, created_at DESC)
  WHERE delivery_type = 'dine_in' AND source = 'web';

COMMENT ON COLUMN orders.table_id IS
  'Dine-in table reference (delivery_type = dine_in).';
COMMENT ON COLUMN orders.table_label IS
  'Table label snapshot at order time — survives rename/deletion.';
COMMENT ON COLUMN orders.pax IS
  'Party size for dine-in orders; null for delivery/pickup.';
COMMENT ON COLUMN orders.payment_method IS
  'Payment-method snapshot for list UI (payments remains the ledger).';

-- ========================================
-- PART C-2: atomic table-QR rate limit
-- ========================================
-- The route's pre-check gives a fast 429, but check-then-insert is not atomic:
-- a burst of concurrent (or directly crafted PostgREST) inserts would all read
-- the same count. This BEFORE INSERT trigger takes a per-table advisory lock
-- and re-counts inside the insert transaction, so the limits hold.
--
-- Limits are mirrored in apps/web/src/app/api/public/table-orders/route.ts.
CREATE OR REPLACE FUNCTION enforce_table_order_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only anonymous table-QR orders are rate limited; staff POS orders and
  -- other channels are not.
  IF NEW.delivery_type <> 'dine_in'
     OR NEW.source <> 'web'
     OR NEW.table_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise inserts for this table until this transaction commits.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.table_id::text, 0));

  IF (
    SELECT count(*)
    FROM orders
    WHERE table_id = NEW.table_id
      AND delivery_type = 'dine_in'
      AND source = 'web'
      AND created_at > clock_timestamp() - interval '5 minutes'
  ) >= 4 THEN
    RAISE EXCEPTION 'table_order_rate_limited' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM orders
    WHERE table_id = NEW.table_id
      AND delivery_type = 'dine_in'
      AND source = 'web'
      AND created_at > clock_timestamp() - interval '10 seconds'
  ) THEN
    RAISE EXCEPTION 'table_order_too_soon' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_table_order_rate_limit ON orders;
CREATE TRIGGER trg_orders_table_order_rate_limit
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_table_order_rate_limit();

COMMENT ON FUNCTION enforce_table_order_rate_limit() IS
  'Serialised per-table rate limit for anonymous table-QR orders (4 / 5 min, 10 s gap).';

REVOKE ALL ON FUNCTION enforce_table_order_rate_limit()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION enforce_table_order_rate_limit() TO service_role;

-- ========================================
-- PART D: RLS
-- ========================================
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

-- Staff may read the floor plan (POS table board, admin tables page).
DROP POLICY IF EXISTS "staff_select_restaurant_tables" ON restaurant_tables;
CREATE POLICY "staff_select_restaurant_tables" ON restaurant_tables
  FOR SELECT USING (
    auth.jwt() -> 'app_metadata' ->> 'role'
      IN ('admin', 'manager', 'cashier', 'kitchen')
  );

-- Admin/manager own the floor plan (writes normally go through the API's
-- service-role client, which bypasses RLS).
DROP POLICY IF EXISTS "admin_manager_all_restaurant_tables" ON restaurant_tables;
CREATE POLICY "admin_manager_all_restaurant_tables" ON restaurant_tables
  FOR ALL USING (is_admin_or_manager());

-- ========================================
-- PART E: close the anonymous order-insert hole
-- ========================================
-- 002 granted anon INSERT on orders (WITH CHECK (true)) for the pre-API
-- checkout. Every current writer (web checkout, bots, GrabFood, legacy import,
-- POS, table QR) runs through a service-role server route. Leaving the policy
-- open would let anyone with the public anon key insert a fake dine-in 'paid'
-- order directly through PostgREST — bypassing the table-QR rate limit and
-- putting junk tickets on the kitchen display.
DROP POLICY IF EXISTS "auth_insert_orders" ON orders;

-- ========================================
-- PART F: atomic POS settlement / close
-- ========================================
-- These run inside one transaction each. The API's service-role client
-- bypasses RLS; the function still locks the order row so a double-tap on
-- "Collect payment" cannot create two payments or two transitions.

CREATE OR REPLACE FUNCTION settle_dine_in_order(
  p_order_id UUID,
  p_method TEXT,
  p_actor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_existing UUID;
BEGIN
  IF p_method NOT IN ('cash', 'qr_pay') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_method');
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_order.delivery_type <> 'dine_in' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_dine_in');
  END IF;

  SELECT id INTO v_existing
  FROM payments
  WHERE order_id = p_order_id AND status = 'succeeded'
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_paid');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'not_pending', 'status', v_order.status
    );
  END IF;

  INSERT INTO payments (order_id, method, amount_cents, status, paid_at)
  VALUES (p_order_id, p_method, v_order.total_cents, 'succeeded', NOW());

  UPDATE orders
  SET status = 'paid', payment_method = p_method, updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
  VALUES (
    p_order_id,
    'payment_collected',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', 'paid',
      'payment_method', p_method,
      'amount_cents', v_order.total_cents
    ),
    p_actor_id
  );

  -- The admin order timeline reads `status_changed`; emit it as well so the
  -- settlement is visible in history, not only in the payments table.
  INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
  VALUES (
    p_order_id,
    'status_changed',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'paid', 'reason', 'payment_collected'),
    p_actor_id
  );

  RETURN jsonb_build_object(
    'ok', true, 'status', 'paid', 'amount_cents', v_order.total_cents
  );
END;
$$;

COMMENT ON FUNCTION settle_dine_in_order(UUID, TEXT, UUID) IS
  'Collect cash/QR Pay for a pending table-QR order and move it to paid (atomic).';

-- SECURITY DEFINER functions are executable by PUBLIC by default. These move
-- money and close tables, so only the server's service role may call them;
-- anon/authenticated must not be able to settle an order via PostgREST.
REVOKE ALL ON FUNCTION settle_dine_in_order(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_dine_in_order(UUID, TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION close_dine_in_table(
  p_table_id UUID,
  p_actor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open INTEGER;
  v_pending INTEGER;
  v_not_ready INTEGER;
  v_closed INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurant_tables WHERE id = p_table_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Serialise against concurrent table-QR inserts/other closes for this table,
  -- so an order cannot slip in between the counts and the UPDATE.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  SELECT count(*) INTO v_open
  FROM orders
  WHERE table_id = p_table_id
    AND delivery_type = 'dine_in'
    AND status IN ('pending', 'paid', 'accepted', 'preparing', 'ready');

  IF v_open = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'empty');
  END IF;

  SELECT count(*) INTO v_pending
  FROM orders
  WHERE table_id = p_table_id
    AND delivery_type = 'dine_in'
    AND status = 'pending';

  IF v_pending > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unpaid');
  END IF;

  SELECT count(*) INTO v_not_ready
  FROM orders
  WHERE table_id = p_table_id
    AND delivery_type = 'dine_in'
    AND status IN ('paid', 'accepted', 'preparing');

  IF v_not_ready > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_ready');
  END IF;

  -- Only ready orders can move forward: ready → picked_up is the canonical
  -- transition (the same one a self-pickup confirmation uses).
  WITH closed AS (
    UPDATE orders
    SET status = 'picked_up', updated_at = NOW()
    WHERE table_id = p_table_id
      AND delivery_type = 'dine_in'
      AND status = 'ready'
    RETURNING id
  )
  INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
  SELECT
    id,
    'status_changed',
    jsonb_build_object('status', 'ready'),
    jsonb_build_object('status', 'picked_up', 'reason', 'table_closed'),
    p_actor_id
  FROM closed;

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'closed', v_closed);
END;
$$;

COMMENT ON FUNCTION close_dine_in_table(UUID, UUID) IS
  'Close a dine-in table once every open order is ready; moves them to picked_up (atomic).';

REVOKE ALL ON FUNCTION close_dine_in_table(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION close_dine_in_table(UUID, UUID) TO service_role;

COMMIT;
