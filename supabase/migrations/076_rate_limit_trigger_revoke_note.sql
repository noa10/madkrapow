-- 076: document why the EXECUTE revoke on the dine-in rate-limit trigger
-- stays (#468/#492 code cards, card #19).
--
-- 057 (re-done in 063) runs REVOKE ALL ON FUNCTION
-- enforce_table_order_rate_limit(). The revoke is inert in both directions:
--   * Trigger machinery invokes trigger functions without an EXECUTE
--     privilege check, and a RETURNS TRIGGER function cannot be invoked
--     directly at all (Postgres: "trigger function can only be called as a trigger"), so the revoke cannot block anything the trigger needs.
--   * Re-granting EXECUTE would grant nothing either - there is no direct
--     call path to gate, and keeping the revoke stays as a guard for the
--     refactor case where a future migration re-creates the function as
--     a non-trigger SECURITY DEFINER helper.
--
-- This comment is the record of the decision ("documents why it stays").
-- Trigger firing is re-verified by the pgTAP probes: table_rpc.test.sql
-- exercises the table_inactive trigger (enforce_dine_in_table_active) and
-- pos_counter_lock.test.sql exercises this function (the
-- table_order_rate_limited raise on the 5th web round).
BEGIN;
COMMENT ON FUNCTION enforce_table_order_rate_limit() IS
  'Trigger function: trigger machinery invokes it without an EXECUTE check (a RETURNS TRIGGER function cannot be called directly), so the 057/063 REVOKE ALL is inert and stays; serialises every dine-in-with-table insert per table via the same advisory lock the close/settle RPCs take; the 4/5-min rate limit applies to anonymous table-QR (web) orders only.';
COMMIT;
