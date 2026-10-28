-- ============================================
-- 065: table-QR payment claimed by the diner
-- ============================================
-- The public table-QR page lets a diner pay from their phone: it shows the
-- merchant's DuitNow QR, and when the diner taps "I've paid" the web route
-- calls this function. The order moves `pending -> paid` atomically, a
-- `payments` row records the QR payment, and the receipt page becomes a PAID
-- receipt the diner shows the cashier.
--
-- TRUST MODEL (deliberate, not an accident):
--   * The table QR token proves the caller is at the table. The create-request
--     idempotency key (orders.idempotency_key, migration 063) proves the caller
--     created THIS order; another diner at the same table cannot claim a round
--     they did not create.
--   * The claim is self-declared: the server cannot see the bank transfer. The
--     `payments.raw.claimed_via = 'table_qr'` marker records that provenance,
--     and the receipt tells the cashier to verify the transfer. A false claim
--     is recovered manually (manager cancels/refunds); there is no automated
--     reversal.
--   * Pending table-QR orders are already kitchen-active and already print a
--     kitchen docket. This function does NOT "start the kitchen"; its status
--     change additionally makes the print bridge emit the receipt job.
--
-- IDEMPOTENT / REPLAY-SAFE:
--   * A retry (lost response, double tap) returns `already_paid` without a
--     second `payments` row.
--   * An order that has already advanced through the kitchen
--     (paid/accepted/preparing/ready/picked_up/delivered) also returns
--     `already_paid`, so the receipt is correct and the diner is never asked
--     to pay twice.
--   * `cancelled` always returns `not_pending`.
--
-- DEPLOY / ROLLBACK:
--   Apply this migration BEFORE deploying the web build that calls it. If the
--   build ships first, claims return 500 and the diner can choose "Pay at the
--   counter instead". Rollback: revert the web build, then
--   DROP FUNCTION claim_table_order_payment(UUID, UUID, TEXT);
--   There is no data migration and no feature flag.
--
-- Idempotent: CREATE OR REPLACE only; no tables, indexes or constraints.

BEGIN;

CREATE OR REPLACE FUNCTION claim_table_order_payment(
  p_order_id UUID,
  p_table_id UUID,
  p_idempotency_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_paid_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- The table token proves the diner is at the table; the idempotency key
  -- proves they created this order. A different diner at the same table must
  -- not be able to mark someone else's round paid.
  IF v_order.table_id IS DISTINCT FROM p_table_id
     OR v_order.delivery_type IS DISTINCT FROM 'dine_in'
     OR v_order.source IS DISTINCT FROM 'web'
     OR v_order.idempotency_key IS NULL
     OR v_order.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT * INTO v_payment
  FROM payments
  WHERE order_id = p_order_id AND status = 'succeeded'
  LIMIT 1;

  -- A cancelled order is never payable, even if an old payment row exists
  -- (e.g. a refunded sale). Check this before the already-paid branch so a
  -- cancellation cannot surface as a PAID receipt.
  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'not_pending', 'status', v_order.status
    );
  END IF;

  -- Already paid, or already advanced through the kitchen. Return the real
  -- status so the diner's receipt is correct and no second payment is written.
  -- A paid order may have no payment row (manual admin paid); that still must
  -- not be charged again.
  IF v_payment.id IS NOT NULL
     OR v_order.status IN ('paid', 'accepted', 'preparing', 'ready',
                           'picked_up', 'delivered') THEN
    RETURN jsonb_build_object(
      'ok', true, 'already_paid', true, 'status', v_order.status,
      'amount_cents', v_order.total_cents,
      'payment_method', COALESCE(v_payment.method, v_order.payment_method),
      'paid_at', v_payment.paid_at
    );
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'not_pending', 'status', v_order.status
    );
  END IF;

  INSERT INTO payments (order_id, method, amount_cents, status, paid_at, raw)
  VALUES (
    p_order_id, 'qr_pay', v_order.total_cents, 'succeeded', NOW(),
    jsonb_build_object('claimed_via', 'table_qr')
  )
  RETURNING paid_at INTO v_paid_at;

  UPDATE orders
  SET status = 'paid', payment_method = 'qr_pay', updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
  VALUES (
    p_order_id, 'payment_claimed',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'paid', 'payment_method', 'qr_pay',
                       'amount_cents', v_order.total_cents),
    NULL
  );

  INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
  VALUES (
    p_order_id, 'status_changed',
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'paid', 'reason', 'qr_payment_claimed'),
    NULL
  );

  RETURN jsonb_build_object(
    'ok', true, 'already_paid', false, 'status', 'paid',
    'amount_cents', v_order.total_cents,
    'payment_method', 'qr_pay', 'paid_at', v_paid_at
  );
END;
$$;

COMMENT ON FUNCTION claim_table_order_payment(UUID, UUID, TEXT) IS
  'Anonymous table-QR claim: pending -> paid, writes the qr_pay ledger row. Scoped by table id + the order creator''s idempotency key.';

REVOKE ALL ON FUNCTION claim_table_order_payment(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_table_order_payment(UUID, UUID, TEXT)
  TO service_role;

COMMIT;
