-- ============================================
-- 058: POS pay-later orders (counter + table QR)
-- ============================================
-- The POS can now send an order to the kitchen before payment is collected:
-- staff choose "Pay later" and the order is created `pending` with no payment
-- row. This migration broadens the settle RPC so it accepts BOTH:
--
--   * table-QR dine-in orders (source='web', delivery_type='dine_in'), and
--   * POS counter orders, including pay-later take-away
--     (source='counter', delivery_type='self_pickup').
--
-- Everything else (web delivery/pickup checkouts) cannot be settled here.
-- No new statuses: pay-later is `pending`; settlement is `pending → paid`.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_orders_counter_pending
  ON orders (created_at DESC)
  WHERE source = 'counter' AND status = 'pending';

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

  -- POS counter orders (dine-in or take-away) and table-QR dine-in orders are
  -- collectable here. Web delivery/pickup pending orders are not.
  IF v_order.source <> 'counter' AND v_order.delivery_type <> 'dine_in' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_settleable');
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
  'Collect cash/QR Pay for a pending POS counter or table-QR order (atomic).';

-- Keep the RPC service-role only after replacing it.
REVOKE ALL ON FUNCTION settle_dine_in_order(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_dine_in_order(UUID, TEXT, UUID) TO service_role;

COMMIT;
