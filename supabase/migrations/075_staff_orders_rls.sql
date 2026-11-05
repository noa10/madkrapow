-- Narrow staff RLS on orders (#468/#492 follow-up card #17).
--
-- Before: "staff_all_orders" (018) granted admin/manager/cashier/kitchen ALL
-- privileges on orders. Kitchen staff only need the active kitchen queue, and
-- staff JWTs never write orders directly (all order mutations go through
-- service-role API routes), so this replaces the FOR ALL policy with:
--
--   staff_select_orders          admin/manager/cashier → full SELECT
--     (/admin/orders is cashier-visible by design: cashiers need history)
--   staff_select_orders_kitchen  kitchen → SELECT of the kitchen-queue set
--     (paid/accepted/preparing/ready, plus pending tickets a kitchen touch
--      moves forward: pending dine-in or counter orders)
--
-- Realtime postgres_changes subscriptions need SELECT only, which both
-- policies provide. No INSERT/UPDATE/DELETE policy for staff on purpose.
-- The pre-existing 018 admin policies (admin_select_orders,
-- admin_update_orders) are left untouched; they predate this card and remain
-- the correct surface for admin/manager/cashier order updates.
BEGIN;
DROP POLICY IF EXISTS "staff_all_orders" ON orders;
CREATE POLICY "staff_select_orders" ON orders FOR SELECT USING (
  auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'manager', 'cashier')
);
CREATE POLICY "staff_select_orders_kitchen" ON orders FOR SELECT USING (
  auth.jwt() -> 'app_metadata' ->> 'role' = 'kitchen'
  AND (
    status IN ('paid', 'accepted', 'preparing', 'ready')
    OR (status = 'pending' AND (delivery_type = 'dine_in' OR source = 'counter'))
  )
);
COMMIT;
