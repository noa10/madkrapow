-- ============================================
-- 074: counter dine-in inserts take the per-table advisory lock
-- ============================================
-- PR #468 follow-up: counter/POS dine-in inserts skipped the per-table
-- advisory lock that the table-QR trigger (057/063) and the close RPC (062)
-- take. 062's confirmed-set comparison kept close safe against counter
-- tickets, but a counter round could still land between a close's set
-- snapshot and its commit: the close completes the confirmed set while the
-- new ticket stays open on the just-closed table. Taking the same lock in
-- the insert trigger serialises counter rounds with close (and with table-QR
-- rounds) per table.
--
-- Lock-order safety: counter inserts take FOR SHARE on the table row (072)
-- before the INSERT fires this trigger's advisory lock; the advisory holders
-- (web inserts, close) never wait on the table row with a lock that conflicts
-- with FOR SHARE — web's FK check takes KEY SHARE (compatible with FOR
-- SHARE), and close waits on orders rows, not the table row. deactivate's
-- FOR UPDATE conflicts with FOR SHARE, but it cannot hold FOR UPDATE while
-- counter holds FOR SHARE (mutually exclusive acquisition), so the wait
-- chains resolve.
--
-- The 4/5-min rate limit stays web-only (064's scope note): counting staff
-- counter rounds would let busy POS traffic exhaust the diners' cap.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_table_order_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Every dine-in insert pointing at a table serialises on the per-table
  -- lock; only the anonymous table-QR rate limit stays source-gated.
  IF NEW.delivery_type <> 'dine_in' OR NEW.table_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.table_id::text, 0));

  IF NEW.source <> 'web' THEN
    RETURN NEW;
  END IF;

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

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_table_order_rate_limit() IS
  'Serialises every dine-in-with-table insert per table via the same advisory lock the close/settle RPCs take; the 4/5-min rate limit applies to anonymous table-QR orders only.';

COMMIT;
