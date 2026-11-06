-- ============================================
-- 081: run analytics views with the caller's RLS, not the view owner's
-- ============================================
-- `daily_order_summary`, `top_selling_items` and `daily_channel_summary` are
-- created with Postgres defaults, i.e. security DEFINER (owner `postgres`).
-- They therefore bypass RLS on `orders` / `order_items`, while Supabase's
-- public-schema default grants give SELECT on the views to `anon` and
-- `authenticated`. With the HubboPOS history loaded, anyone holding the
-- publishable key could read two years of daily revenue, order counts,
-- channel mix, discounts and per-item sales:
--
--   GET /rest/v1/daily_order_summary?select=*   (anon key) → 200, real figures
--
-- 024_analytics_rls.sql claims "views inherit RLS from underlying tables" —
-- that is not true for definer views; the migration is documentation only.
-- This migration makes the claim true instead of editing the historical file.
--
-- `security_invoker = true` (PG15+, project is PG15.14) makes each view run
-- with the querying role's privileges and RLS:
--   * anon / unprivileged authenticated → no SELECT policy on orders → 0 rows
--   * admin/manager/cashier JWT        → staff_select_orders (075) +
--                                       admin_select_order_items (018) → data
--   * service_role                      → bypasses RLS → data
--
-- /api/admin/analytics uses requireAdmin() → a user-session client whose JWT
-- carries app_metadata.role = 'admin', so the admin page keeps working.
-- Output columns are unchanged.

BEGIN;

ALTER VIEW daily_order_summary SET (security_invoker = true);
ALTER VIEW top_selling_items SET (security_invoker = true);
ALTER VIEW daily_channel_summary SET (security_invoker = true);

COMMIT;
