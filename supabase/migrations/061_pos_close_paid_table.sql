-- ============================================
-- 061: a settled table can always be closed
-- ============================================
-- 057 required every open dine-in order to be `ready` before closing. The only
-- controls that move an order paid → preparing → ready live on the admin
-- kitchen board and the Flutter app; the POS — the screen a cashier actually
-- works from — has none. A pay-now table was therefore created `paid` and was
-- blocked from closing forever, even though the money was recorded correctly.
--
-- The gate is now the bill, not the kitchen: a table closes once no ticket is
-- `pending` (unpaid). Any ticket still cooking is completed to `picked_up`
-- with `reason: 'table_closed'`, and its real prior status is recorded on the
-- event, so the timeline stays truthful — no synthetic preparing/ready marks.
-- The restore notice the cashier sees at the counter is the POS confirm dialog.

BEGIN;

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
  v_order RECORD;
  v_closed INTEGER := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurant_tables WHERE id = p_table_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Serialise against concurrent table-QR inserts and the settle RPC, so an
  -- order cannot slip in between the counts and the updates below.
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

  -- Unpaid is the only remaining blocker: the bill must be settled first.
  IF v_pending > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unpaid');
  END IF;

  -- Complete every open ticket. `ready → picked_up` is the canonical forward
  -- transition; tickets the kitchen never advanced take the same step with the
  -- `table_closed` reason and their true prior status preserved on the event.
  FOR v_order IN
    SELECT id, status
    FROM orders
    WHERE table_id = p_table_id
      AND delivery_type = 'dine_in'
      AND status IN ('paid', 'accepted', 'preparing', 'ready')
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

COMMENT ON FUNCTION close_dine_in_table(UUID, UUID) IS
  'Close a dine-in table once its bill is settled; completes every open ticket to picked_up (atomic).';

REVOKE ALL ON FUNCTION close_dine_in_table(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION close_dine_in_table(UUID, UUID) TO service_role;

COMMIT;
