-- ============================================
-- 064: floor-plan audit trail + atomic deactivation
-- ============================================
-- Review round 2 on the POS/table-QR feature:
--
-- 1. Rotating a table's QR token invalidates every printed code, and
--    deactivating/deleting a table changes what the floor accepts. None of
--    those actions left a record: `order_events` is FK'd to `orders`, so it
--    cannot hold them. `table_events` is the audit surface for floor-plan
--    changes. The row survives the table (FK ON DELETE SET NULL) with a label
--    snapshot, so a deleted table's history is still readable.
--
-- 2. Deactivating a table counted open orders and then wrote `is_active` in a
--    second statement — the same TOCTOU 063 fixed for DELETE. A counter order
--    could land in between and leave an occupied table hidden from the POS
--    board. `deactivate_restaurant_table` does the lock, check and write in one
--    transaction, and records the event.
--
-- 3. `delete_restaurant_table` now takes the actor and records the event in
--    the same transaction. The 1-arg version is dropped: only this PR's admin
--    route calls it, so there is no other consumer to break. Apply 064 with
--    (or before) the web build that calls the 2-arg form.
--
-- 4. `enforce_dine_in_table_active` closes the other direction of (2): an
--    insert that already passed the route's active-table check waits on the
--    deactivation's row lock, then re-reads `is_active = false` and is
--    rejected instead of landing on a hidden table.
--
-- The per-table rate limit is deliberately unchanged. Both the route
-- pre-check and `enforce_table_order_rate_limit` count `source = 'web'` only:
-- the cap exists to bound anonymous QR abuse, and staff-keyed counter rounds
-- are authenticated. Counting counter rounds would let a busy table's own POS
-- traffic exhaust the diners' cap — the opposite of the intent. The comment on
-- the function now states the scope explicitly.

BEGIN;

-- ========================================
-- PART A: table_events
-- ========================================
CREATE TABLE IF NOT EXISTS table_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable and SET NULL so a deleted table's audit row survives.
  table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  -- Snapshot: the row must still identify the table after deletion.
  table_label TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'updated', 'activated', 'deactivated', 'token_rotated', 'deleted'
  )),
  -- Same shape as order_events.actor_id (059): a bare UUID, no FK, so the
  -- audit row is never lost when an auth user is removed.
  actor_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_events_table
  ON table_events (table_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_table_events_created
  ON table_events (created_at DESC);

ALTER TABLE table_events ENABLE ROW LEVEL SECURITY;

-- Staff may read the floor-plan history. Writes go through the service-role
-- API routes (which bypass RLS); there is deliberately no INSERT policy, so a
-- client JWT cannot forge an audit row.
DROP POLICY IF EXISTS "staff_select_table_events" ON table_events;
CREATE POLICY "staff_select_table_events" ON table_events
  FOR SELECT USING (
    auth.jwt() -> 'app_metadata' ->> 'role'
      IN ('admin', 'manager', 'cashier', 'kitchen')
  );

COMMENT ON TABLE table_events IS
  'Audit trail for floor-plan changes (create/edit/activate/deactivate/rotate/delete).';
COMMENT ON COLUMN table_events.table_label IS
  'Label snapshot at event time — survives table deletion.';

-- ========================================
-- PART B: atomic deactivation
-- ========================================
-- The admin route used to count open orders and then update in a second
-- statement. A counter order could land between the two, leaving an occupied
-- table that the POS board no longer lists (it filters is_active = true).
CREATE OR REPLACE FUNCTION deactivate_restaurant_table(
  p_table_id UUID,
  p_actor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table restaurant_tables%ROWTYPE;
BEGIN
  -- The row lock serialises this against a concurrent insert's FK check and
  -- against another deactivation.
  SELECT * INTO v_table
  FROM restaurant_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Already inactive: nothing to guard, and renaming an inactive table must
  -- not emit a second 'deactivated' event.
  IF NOT v_table.is_active THEN
    RETURN jsonb_build_object('ok', true, 'table', to_jsonb(v_table));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM orders
    WHERE table_id = p_table_id
      AND status IN ('pending', 'paid', 'accepted', 'preparing', 'ready')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'has_orders');
  END IF;

  UPDATE restaurant_tables
  SET is_active = false
  WHERE id = p_table_id
  RETURNING * INTO v_table;

  INSERT INTO table_events (table_id, table_label, event_type, actor_id)
  VALUES (p_table_id, v_table.label, 'deactivated', p_actor_id);

  RETURN jsonb_build_object('ok', true, 'table', to_jsonb(v_table));
END;
$$;

COMMENT ON FUNCTION deactivate_restaurant_table(UUID, UUID) IS
  'Deactivate a table atomically, refusing when it still has open orders; records the audit event.';

REVOKE ALL ON FUNCTION deactivate_restaurant_table(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deactivate_restaurant_table(UUID, UUID) TO service_role;

-- ========================================
-- PART C: deletion records its own audit event
-- ========================================
-- Only this PR's admin route calls the function, so the 1-arg form can be
-- replaced outright rather than left as an untraced overload.
DROP FUNCTION IF EXISTS delete_restaurant_table(UUID);

CREATE OR REPLACE FUNCTION delete_restaurant_table(
  p_table_id UUID,
  p_actor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table restaurant_tables%ROWTYPE;
BEGIN
  SELECT * INTO v_table
  FROM restaurant_tables
  WHERE id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM orders WHERE table_id = p_table_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'has_orders');
  END IF;

  -- Written before the delete. The FK's ON DELETE SET NULL keeps the audit
  -- row (and its label snapshot) after the table is gone.
  INSERT INTO table_events (table_id, table_label, event_type, actor_id)
  VALUES (p_table_id, v_table.label, 'deleted', p_actor_id);

  DELETE FROM restaurant_tables WHERE id = p_table_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION delete_restaurant_table(UUID, UUID) IS
  'Delete a table only when no order references it (atomic history check); records the audit event.';

REVOKE ALL ON FUNCTION delete_restaurant_table(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_restaurant_table(UUID, UUID) TO service_role;

-- ========================================
-- PART D: no orders on an inactive table
-- ========================================
-- The route checks is_active before inserting, but that check is a separate
-- statement from the insert. This trigger closes the gap: the FOR KEY SHARE
-- conflicts with deactivate_restaurant_table's FOR UPDATE, so a racing insert
-- waits for the deactivation to commit and then sees is_active = false.
CREATE OR REPLACE FUNCTION enforce_dine_in_table_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_type <> 'dine_in' OR NEW.table_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM restaurant_tables
  WHERE id = NEW.table_id
    AND is_active
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'table_inactive' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_dine_in_table_active ON orders;
CREATE TRIGGER trg_orders_dine_in_table_active
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_dine_in_table_active();

COMMENT ON FUNCTION enforce_dine_in_table_active() IS
  'Rejects a dine-in order whose table is missing or inactive, including one racing a deactivation.';

REVOKE ALL ON FUNCTION enforce_dine_in_table_active()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION enforce_dine_in_table_active() TO service_role;

-- ========================================
-- PART E: rate-limit scope is explicit (no behaviour change)
-- ========================================
COMMENT ON FUNCTION enforce_table_order_rate_limit() IS
  'Serialised per-table rate limit for anonymous table-QR orders only (4 / 5 min). Counter/POS rounds are authenticated and deliberately excluded; the public route pre-check uses the same scope.';

COMMIT;
