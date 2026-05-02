-- ========================================
-- 029_fix_admin_role_checks.sql
-- ========================================
-- Fixes:
-- 1. lalamove_shipments: user_metadata -> app_metadata in admin_select_all_shipments
-- 2. store_settings: remove overly permissive auth_update policy (uid IS NOT NULL)
-- 3. hubbopos: remove overly permissive admin_read policies (uid IS NOT NULL)
-- ========================================

-- Fix 1: Replace broken lalamove_shipments admin policy
DROP POLICY IF EXISTS "admin_select_all_shipments" ON lalamove_shipments;
CREATE POLICY "admin_select_all_shipments" ON lalamove_shipments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM customers c
    WHERE c.auth_user_id = auth.uid()
      AND (auth.jwt() ->> 'role' = 'service_role'
        OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  )
);

-- Fix 2: Replace overly permissive store_settings UPDATE policy
-- Only staff roles should be able to update store settings
DROP POLICY IF EXISTS "auth_update_store_settings" ON store_settings;
CREATE POLICY "staff_update_store_settings" ON store_settings FOR UPDATE USING (
  (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
  OR (auth.jwt() ->> 'role' = 'service_role')
) WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
  OR (auth.jwt() ->> 'role' = 'service_role')
);

-- Fix 3: Replace overly permissive hubbopos admin_read policies
DROP POLICY IF EXISTS "hubbopos_logs_admin_read" ON hubbopos_api_logs;
CREATE POLICY "hubbopos_logs_staff_read" ON hubbopos_api_logs FOR SELECT USING (
  (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
  OR (auth.jwt() ->> 'role' = 'service_role')
);

DROP POLICY IF EXISTS "hubbopos_queue_admin_read" ON hubbopos_sync_queue;
CREATE POLICY "hubbopos_queue_staff_read" ON hubbopos_sync_queue FOR SELECT USING (
  (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
  OR (auth.jwt() ->> 'role' = 'service_role')
);

DROP POLICY IF EXISTS "hubbopos_runs_admin_read" ON hubbopos_sync_runs;
CREATE POLICY "hubbopos_runs_staff_read" ON hubbopos_sync_runs FOR SELECT USING (
  (auth.jwt() -> 'app_metadata' ->> 'role' = ANY (ARRAY['admin', 'manager']))
  OR (auth.jwt() ->> 'role' = 'service_role')
);
