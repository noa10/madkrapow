-- ============================================
-- 20261105195200: reopen a wrongly closed dine-in table
-- ============================================
-- close_dine_in_table (061/062) completes a table's settled rounds to
-- picked_up and writes an order_events row with reason 'table_closed'. Before
-- this migration a mistaken close was irreversible: picked_up has no admin
-- transition, and the POS only ever showed a free table.
--
-- Reopen is the inverse, deliberately narrow:
--   * dine-in only, and only tickets close_dine_in_table closed (their latest
--     status_changed event says reason = 'table_closed');
--   * same Asia/Kuala_Lumpur calendar day as the close, because reopen
--     retroactively changes that day's analytics;
--   * refused while the table has open orders — a new party on the same table
--     must never have an earlier round mixed into its bill;
--   * mandatory reason, and audit rows on both surfaces (order_events and
--     table_events).
--
-- Restored tickets land on 'ready' (the approved semantics).
-- ADMIN_VALID_TRANSITIONS is untouched: delivery orders stay webhook-controlled.

BEGIN;

-- Widen the audit vocabulary; the table (064) predates this action.
ALTER TABLE table_events DROP CONSTRAINT IF EXISTS table_events_event_type_check;
ALTER TABLE table_events ADD CONSTRAINT table_events_event_type_check CHECK (
  event_type IN (
    'created', 'updated', 'activated', 'deactivated', 'token_rotated',
    'deleted', 'reopened'
  )
);

CREATE OR REPLACE FUNCTION reopen_dine_in_table(
  p_table_id UUID,
  p_actor_id UUID,
  p_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table restaurant_tables%ROWTYPE;
  v_order RECORD;
  v_reopened INTEGER := 0;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'reason_required');
  END IF;

  SELECT * INTO v_table
  FROM restaurant_tables
  WHERE id = p_table_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Same key close_dine_in_table and the order-insert trigger take, so a
  -- close/reopen cannot interleave with a new round landing at the table.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  -- A table with open tickets is occupied by someone else; reopening an old
  -- round would mix two parties into one bill.
  IF EXISTS (
    SELECT 1
    FROM orders
    WHERE table_id = p_table_id
      AND delivery_type = 'dine_in'
      AND status IN ('pending', 'paid', 'accepted', 'preparing', 'ready')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'occupied');
  END IF;

  -- Candidates: picked_up dine-in tickets whose latest status event is a
  -- close_dine_in_table completion today (KL). Delivery picks_up rows come
  -- from Lalamove webhooks and carry a different reason, so they are excluded.
  FOR v_order IN
    SELECT o.id
    FROM orders o
    JOIN LATERAL (
      SELECT e.new_value, e.created_at
      FROM order_events e
      WHERE e.order_id = o.id
        AND e.event_type = 'status_changed'
      ORDER BY e.created_at DESC
      LIMIT 1
    ) closed ON TRUE
    WHERE o.table_id = p_table_id
      AND o.delivery_type = 'dine_in'
      AND o.status = 'picked_up'
      AND closed.new_value ->> 'status' = 'picked_up'
      AND closed.new_value ->> 'reason' = 'table_closed'
      AND (closed.created_at AT TIME ZONE 'Asia/Kuala_Lumpur')::date
          = (NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date
    ORDER BY o.created_at
    FOR UPDATE OF o
  LOOP
    UPDATE orders
    SET status = 'ready', updated_at = NOW()
    WHERE id = v_order.id;

    INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
    VALUES (
      v_order.id,
      'status_changed',
      jsonb_build_object('status', 'picked_up'),
      jsonb_build_object(
        'status', 'ready',
        'reason', 'table_reopened'
      ),
      p_actor_id
    );

    v_reopened := v_reopened + 1;
  END LOOP;

  IF v_reopened = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_closed');
  END IF;

  INSERT INTO table_events (table_id, table_label, event_type, actor_id, details)
  VALUES (
    p_table_id,
    v_table.label,
    'reopened',
    p_actor_id,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'reopened', v_reopened
    )
  );

  RETURN jsonb_build_object('ok', true, 'reopened', v_reopened);
END;
$$;

COMMENT ON FUNCTION reopen_dine_in_table(UUID, UUID, TEXT) IS
  'Reopen today''s close_dine_in_table completions on a dine-in table (picked_up -> ready) with a mandatory reason and audit rows.';

REVOKE ALL ON FUNCTION reopen_dine_in_table(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reopen_dine_in_table(UUID, UUID, TEXT) TO service_role;

COMMIT;
