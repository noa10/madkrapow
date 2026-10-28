-- ============================================
-- 062: closing must match the bill the cashier confirmed
-- ============================================
-- 061 completed whatever was open at execution time. The confirm dialog shows
-- a snapshot, so a round that lands while it is open (a diner sends another QR
-- order and pays, or a second cashier keys a pay-now round) was completed
-- unseen: it vanished from the kitchen board and was counted as served even
-- though it was never on screen. That is the same class of bug 060 fixed for
-- settlement, so it gets the same guard.
--
-- The confirmed order ids are now part of the call. The function locks the
-- current open set, compares it with the snapshot, and returns `stale_close`
-- without writing anything when they differ. This also closes the race where a
-- counter ticket is inserted between the "is anything unpaid?" count and the
-- completion loop: the insert changes the set, so the close is refused.
--
-- The 2-arg overload is dropped; every caller must state what it confirmed.

BEGIN;

DROP FUNCTION IF EXISTS close_dine_in_table(UUID, UUID);

CREATE OR REPLACE FUNCTION close_dine_in_table(
  p_table_id UUID,
  p_actor_id UUID,
  p_expected_order_ids UUID[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_expected UUID[];
  v_order RECORD;
  v_closed INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurant_tables WHERE id = p_table_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF p_expected_order_ids IS NULL OR cardinality(p_expected_order_ids) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'empty');
  END IF;

  SELECT array_agg(DISTINCT id) INTO v_expected
  FROM unnest(p_expected_order_ids) AS id;

  -- Serialise against other closes and against table-QR inserts (the 057
  -- trigger takes this same key for source='web'). Counter inserts do not take
  -- it — the set comparison below is what makes those safe.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  -- Lock the current open set; the comparison is authoritative because these
  -- rows cannot change until this transaction commits.
  SELECT array_agg(id) INTO v_ids
  FROM (
    SELECT id
    FROM orders
    WHERE table_id = p_table_id
      AND delivery_type = 'dine_in'
      AND status IN ('pending', 'paid', 'accepted', 'preparing', 'ready')
    ORDER BY created_at
    FOR UPDATE
  ) locked;

  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'empty');
  END IF;

  IF cardinality(v_ids) <> cardinality(v_expected)
     OR NOT (v_ids <@ v_expected AND v_expected <@ v_ids) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale_close');
  END IF;

  -- The bill is the gate: nothing may still be unpaid.
  IF EXISTS (
    SELECT 1
    FROM orders
    WHERE id = ANY(v_ids) AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unpaid');
  END IF;

  -- Complete every confirmed ticket. `ready → picked_up` is the canonical
  -- forward transition; tickets the kitchen never advanced take the same step
  -- with the `table_closed` reason and their true prior status on the event.
  FOR v_order IN
    SELECT id, status
    FROM orders
    WHERE id = ANY(v_ids)
    ORDER BY created_at
    FOR UPDATE
  LOOP
    UPDATE orders
    SET status = 'picked_up', updated_at = NOW()
    WHERE id = v_order.id;

    INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
    VALUES (
      v_order.id,
      'status_changed',
      jsonb_build_object('status', v_order.status),
      jsonb_build_object(
        'status', 'picked_up',
        'reason', 'table_closed',
        'from', v_order.status
      ),
      p_actor_id
    );

    v_closed := v_closed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'closed', v_closed);
END;
$$;

COMMENT ON FUNCTION close_dine_in_table(UUID, UUID, UUID[]) IS
  'Close a dine-in table once the confirmed set of open orders is fully paid; completes them to picked_up (atomic, stale-safe).';

REVOKE ALL ON FUNCTION close_dine_in_table(UUID, UUID, UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION close_dine_in_table(UUID, UUID, UUID[]) TO service_role;

COMMIT;
