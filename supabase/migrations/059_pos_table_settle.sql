-- ============================================
-- 059: grouped table settlement + order_events drift fix
-- ============================================
-- 1) The live `order_events` table is missing `actor_id` even though 008
--    declares it (migration recorded as applied, table created earlier without
--    the column). Every settle/close RPC therefore failed with
--    `42703 column "actor_id" of relation "order_events" does not exist`, and
--    the POS route's `created` event silently failed too. Add it idempotently.
ALTER TABLE order_events
  ADD COLUMN IF NOT EXISTS actor_id UUID;

COMMENT ON COLUMN order_events.actor_id IS
  'Staff user who caused the transition, when known.';

-- 2) Collect payment for every pending dine-in order at a table in one
--    transaction. The counter UI shows one total per table; the ledger still
--    gets one `payments` row per order because `payments.order_id` is required.
--
--    Concurrency: the row locks plus the status filter mean a second cashier's
--    collect finds nothing left and returns `nothing_to_settle` (mapped to 409),
--    instead of recording a second payment.

CREATE OR REPLACE FUNCTION settle_dine_in_table(
  p_table_id UUID,
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
  v_count INTEGER := 0;
  v_total INTEGER := 0;
BEGIN
  IF p_method NOT IN ('cash', 'qr_pay') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_method');
  END IF;

  FOR v_order IN
    SELECT *
    FROM orders
    WHERE table_id = p_table_id
      AND delivery_type = 'dine_in'
      AND status = 'pending'
    ORDER BY created_at
    FOR UPDATE
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

COMMENT ON FUNCTION settle_dine_in_table(UUID, TEXT, UUID) IS
  'Collect cash/QR Pay for every pending dine-in order at a table (atomic).';

-- Moves money: only the server's service role may call it via PostgREST.
REVOKE ALL ON FUNCTION settle_dine_in_table(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION settle_dine_in_table(UUID, TEXT, UUID) TO service_role;
