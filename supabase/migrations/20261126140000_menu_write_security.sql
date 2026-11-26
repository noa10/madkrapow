-- Remove the legacy permissive policies: PostgreSQL ORs them with the later
-- admin/manager policies, so any authenticated user could otherwise write.
DROP POLICY IF EXISTS auth_insert_categories ON public.categories;
DROP POLICY IF EXISTS auth_update_categories ON public.categories;
DROP POLICY IF EXISTS auth_delete_categories ON public.categories;
DROP POLICY IF EXISTS auth_insert_menu_items ON public.menu_items;
DROP POLICY IF EXISTS auth_update_menu_items ON public.menu_items;
DROP POLICY IF EXISTS auth_delete_menu_items ON public.menu_items;
DROP POLICY IF EXISTS auth_insert_modifier_groups ON public.modifier_groups;
DROP POLICY IF EXISTS auth_update_modifier_groups ON public.modifier_groups;
DROP POLICY IF EXISTS auth_delete_modifier_groups ON public.modifier_groups;
DROP POLICY IF EXISTS auth_insert_modifiers ON public.modifiers;
DROP POLICY IF EXISTS auth_update_modifiers ON public.modifiers;
DROP POLICY IF EXISTS auth_delete_modifiers ON public.modifiers;
DROP POLICY IF EXISTS auth_insert_menu_item_modifier_groups ON public.menu_item_modifier_groups;
DROP POLICY IF EXISTS auth_update_menu_item_modifier_groups ON public.menu_item_modifier_groups;
DROP POLICY IF EXISTS auth_delete_menu_item_modifier_groups ON public.menu_item_modifier_groups;

-- Reject unknown/NULL claims as well as explicit non-admin roles. Trusted SQL
-- maintenance that changes menu rows must set transaction-local service claims,
-- e.g. SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- Only trusted database sessions may set these claims; do not expose this path
-- to untrusted SQL clients. There is deliberately no postgres-role bypass.
CREATE OR REPLACE FUNCTION public.validate_admin_write()
RETURNS trigger AS $$
BEGIN
    IF ((auth.jwt()->'app_metadata'->>'role' IN ('admin', 'manager'))
        OR auth.jwt()->>'role' = 'service_role') IS NOT TRUE THEN
        RAISE EXCEPTION 'Admin or manager role required for write operations on %', TG_TABLE_NAME;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Empty search_path prevents shadowing of unqualified names in these helpers.
ALTER FUNCTION public.validate_admin_write() SET search_path = '';
ALTER FUNCTION public.is_admin_or_manager() SET search_path = '';

-- 20261126131000 creates this invoker-rights helper. Triggers do not need
-- EXECUTE on their function, so direct client calls can be closed.
DO $$
BEGIN
    IF to_regprocedure('public.archive_menu_entity()') IS NOT NULL THEN
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.archive_menu_entity() FROM PUBLIC, anon, authenticated';
    END IF;
END $$;

-- These table-level privileges bypass row policies or allow schema changes.
-- Service and owner privileges are intentionally left untouched.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
    public.categories, public.menu_items, public.modifier_groups,
    public.modifiers, public.menu_item_modifier_groups
FROM PUBLIC, anon, authenticated;

-- The GrabFood channel mirror is written only by the trusted refresh worker.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
    public.channel_categories, public.channel_products, public.channel_modifiers
FROM PUBLIC, anon, authenticated;
