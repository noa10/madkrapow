-- ========================================
-- 017_orders_update_policy.sql
-- Adds missing UPDATE RLS policy for orders table.
-- Without this, authenticated users (including admins via browser client)
-- cannot update order status — the update is silently blocked by RLS.
-- ========================================

-- Authenticated users can update their own orders
-- (matches the same ownership check as the existing SELECT policy)
CREATE POLICY "auth_update_own_orders" ON orders FOR UPDATE USING (
    auth.uid() IN (SELECT auth_user_id FROM customers WHERE id = customer_id)
);

-- Admin users: full update access to orders (via admin role check)
CREATE POLICY "admin_update_orders" ON orders FOR UPDATE USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'
);
