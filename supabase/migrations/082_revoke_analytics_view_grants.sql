-- ============================================
-- 082: revoke analytics view grants from anon / authenticated
-- ============================================
-- 081 made the three analytics views security_invoker, so RLS already stops
-- anon from reading any rows. The Supabase public-schema default ACLs are
-- still wide open though:
--
--   {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--
-- That is belt-and-braces work: deny at the privilege layer as well, so a
-- future `CREATE OR REPLACE VIEW` that accidentally drops security_invoker
-- cannot silently re-expose two years of revenue.
--
--   * anon          → REVOKE ALL (no business reading or writing admin analytics)
--   * authenticated → keep SELECT. /api/admin/analytics uses requireAdmin(),
--                     which returns a user-session (authenticated-role) client
--                     whose JWT carries app_metadata.role = 'admin'. Revoking
--                     SELECT here would break the admin page.
--   * service_role  → left intact (trusted server-side caller).
--
-- Aggregate views are not updatable, so the INSERT/UPDATE/DELETE grants were
-- never usable, but removing them keeps the ACL honest.
--
-- No application code changes.
-- (081's header says PG15.14; production and local CI actually run 17.6 —
--  `security_invoker` and `MAINTAIN` need 15+ / 17+ respectively, both fine.)

BEGIN;

REVOKE ALL PRIVILEGES ON
  daily_order_summary, top_selling_items, daily_channel_summary
FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON
  daily_order_summary, top_selling_items, daily_channel_summary
FROM authenticated;

COMMIT;
