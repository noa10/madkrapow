-- ========================================
-- 018_fix_admin_rls_and_order_events.sql
-- Fixes broken admin RLS policy (checks user_metadata instead of app_metadata)
-- and adds admin SELECT/INSERT policies for order_events and related tables.
-- Also seeds app_metadata.role = 'admin' for existing admin users.
-- ========================================

-- 1. Drop broken admin_update_orders policy (checks user_metadata, but admin
--    role lives in app_metadata)
DROP POLICY IF EXISTS "admin_update_orders" ON orders;

-- 2. Recreate with correct app_metadata check
CREATE POLICY "admin_update_orders" ON orders FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- 3. Admin SELECT on orders (needed for merchant app to list/fetch orders)
CREATE POLICY "admin_select_orders" ON orders FOR SELECT USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- 4. Admin SELECT on order_items (for order detail view)
CREATE POLICY "admin_select_order_items" ON order_items FOR SELECT USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- 5. Admin INSERT on order_events (API route inserts audit rows server-side
--    via service_role, but this policy covers the case where admin-user JWT
--    is used directly)
CREATE POLICY "admin_insert_order_events" ON order_events FOR INSERT WITH CHECK (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- 6. Admin SELECT on order_events
CREATE POLICY "admin_select_order_events" ON order_events FOR SELECT USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'
);

-- 7. Seed app_metadata.role = 'admin' for existing admin users.
--    This moves the role claim from user_metadata (where the broken policy
--    checked) to app_metadata (where the new policies check).
--    If the user already has role in app_metadata, this is a no-op.
--    IMPORTANT: Replace the user IDs below with actual admin user UUIDs.
--    You can find them via: SELECT id, raw_user_meta_data, raw_app_meta_data FROM auth.users;
UPDATE auth.users
SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'admin')
WHERE raw_user_meta_data->>'role' = 'admin'
   OR raw_app_meta_data->>'role' = 'admin';
