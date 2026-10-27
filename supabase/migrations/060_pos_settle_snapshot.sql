-- ============================================
-- 060: grouped settlement must match the confirmed bill
-- ============================================
-- 059 settled every pending order at the table at execution time. The counter
-- modal confirms a snapshot total, so a round added (or paid) between opening
-- the modal and confirming could be charged without being shown — for QR the
-- customer would underpay, for cash the till would not balance.
--
-- The cashier's expected order set is now part of the call. The function locks
-- the current pending set, compares it with the snapshot, and returns
-- `stale_settle` without writing anything when they differ; the POS refreshes
-- and asks the cashier to review the new total.

DROP FUNCTION IF EXISTS settle_dine_in_table(UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION settle_dine_in_table(
  p_table_id UUID,
  p_method TEXT,
  p_actor_id UUID,
  p_expected_order_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_existing UUID;
  v_ids UUID[];
  v_expected UUID[];
  v_count INTEGER := 0;
  v_total INTEGER := 0;
BEGIN
  IF p_method NOT IN ('cash', 'qr_pay') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_method');
  END IF;

  IF p_expected_order_ids IS NULL OR cardinality(p_expected_order_ids) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'nothing_to_settle');
  END IF;

  SELECT array_agg(DISTINCT id) INTO v_expected
  FROM unnest(p_expected_order_ids) AS id;

  -- Lock the current pending set; the comparison below is authoritative because
  -- these rows cannot change until this transaction commits.
  SELECT array_agg(id) INTO v_ids
  FROM (
    SELECT id
    FROM orders
    WHERE table_id = p_table_id
      AND delivery_type = 'dine_in'
      AND status = 'pending'
    ORDER BY created_at
    FOR UPDATE
  ) locked;

  IF v_ids IS NULL
     OR cardinality(v_ids) <> cardinality(v_expected)
     OR NOT (v_ids <@ v_expected AND v_expected <@ v_ids) THEN
    -- If none of the confirmed tickets is pending and at least one has a
    -- succeeded payment, this is a retry after a lost response — report it as
    -- already collected rather than as a changed table.
    IF NOT EXISTS (
         SELECT 1 FROM orders
         WHERE id = ANY(v_expected) AND status = 'pending'
       )
       AND EXISTS (
         SELECT 1 FROM payments
         WHERE order_id = ANY(v_expected) AND status = 'succeeded'
       ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'nothing_to_settle');
    END IF;

    RETURN jsonb_build_object('ok', false, 'code', 'stale_settle');
  END IF;

  FOR v_order IN
    SELECT * FROM orders
    WHERE id = ANY(v_ids)
    ORDER BY created_at
  LOOP
    SELECT id INTO v_existing
    FROM payments
    WHERE order_id = v_order.id AND status = 'succeeded'
    LIMIT 1;

    -- A succeeded payment with a still-pending order is stale bookkeeping:
    -- mark it paid without writing a second ledger row.
    IF v_existing IS NULL THEN
      INSERT INTO payments (order_id, method, amount_cents, status, paid_at)
      VALUES (v_order.id, p_method, v_order.total_cents, 'succeeded', NOW());
    END IF;

    UPDATE orders
    SET status = 'paid', payment_method = p_method, updated_at = NOW()
    WHERE id = v_order.id;

    INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
    VALUES (
      v_order.id,
      'payment_collected',
      jsonb_build_object('status', 'pending'),
      jsonb_build_object(
        'status', 'paid',
        'payment_method', p_method,
        'amount_cents', v_order.total_cents,
        'via', 'table_settle'
      ),
      p_actor_id
    );

    INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
    VALUES (
      v_order.id,
      'status_changed',
      jsonb_build_object('status', 'pending'),
      jsonb_build_object('status', 'paid', 'reason', 'payment_collected'),
      p_actor_id
    );

    v_count := v_count + 1;
    v_total := v_total + v_order.total_cents;
  END LOOP;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'nothing_to_settle');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'settled_count', v_count,
    'amount_cents', v_total
  );
END;
$$;

COMMENT ON FUNCTION settle_dine_in_table(UUID, TEXT, UUID, UUID[]) IS
  'Collect cash/QR Pay for the confirmed set of pending dine-in orders at a table (atomic, stale-safe).';

REVOKE ALL ON FUNCTION settle_dine_in_table(UUID, TEXT, UUID, UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_dine_in_table(UUID, TEXT, UUID, UUID[]) TO service_role;
