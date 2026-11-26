-- Harden RPC EXECUTE exposure.
--
-- PostgreSQL grants EXECUTE on every new public function to PUBLIC by default, and
-- Supabase additionally grants it to anon, authenticated and service_role, so helpers
-- created without an explicit REVOKE are callable with the anon key that ships in the
-- web bundle. These functions either bypass RLS (SECURITY DEFINER) or trust a
-- caller-supplied customer id, so each is narrowed to the roles that actually call it.
--
-- public.is_admin_or_manager() is deliberately left executable by anon and
-- authenticated: 20 RLS policies call it, and Postgres evaluates policy expressions
-- with the privileges of the querying role. Revoking it would break menu browsing.

BEGIN;

-- ── Introspection helpers: no application caller ──────────────────────────────
-- These two were created outside the migration history (they exist in the hosted
-- project but not in a fresh replay), so the REVOKE has to tolerate their absence
-- or `supabase db reset` would fail here.
DO $$
BEGIN
  IF to_regprocedure('public.get_schema_info()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_schema_info() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_schema_info() TO service_role';
  END IF;

  IF to_regprocedure('public.get_enum_types()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_enum_types() FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_enum_types() TO service_role';
  END IF;
END;
$$;

-- ── Maintenance helper: never called from application code ────────────────────
REVOKE EXECUTE ON FUNCTION public.cleanup_order_display_codes(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_order_display_codes(integer) TO service_role;

-- ── Display-code reservation ──────────────────────────────────────────────────
-- Called by the orders_assign_display_code BEFORE INSERT trigger, which runs as the
-- inserting role. Every order-writing path is service_role or a SECURITY DEFINER RPC
-- owned by postgres, so no end-user role needs this. Allowing anon to call it lets a
-- caller burn codes out of the per-day pool.
REVOKE EXECUTE ON FUNCTION public.reserve_order_display_code(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_order_display_code(date) TO service_role;

-- Revoking EXECUTE alone does not close that door: 047 created the reservation table
-- without RLS, so on a database built from the migrations alone the anon key that
-- ships in the web bundle can still read, insert, update or truncate it through
-- PostgREST. Deleting today's rows would let the function reissue codes already
-- printed on receipts, and orders.display_code has only a non-unique index.
-- The hosted project already runs with RLS enabled and zero policies (deny-all for
-- anon/authenticated, bypassed by service_role and the table owner), but that state is
-- not in the repo, so a fresh or staging database is exposed. No policies are needed:
-- only service_role and the trigger's definer role ever touch this table.
ALTER TABLE public.order_display_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_display_codes FROM PUBLIC, anon, authenticated;

-- ── Promo usage counter ───────────────────────────────────────────────────────
-- Called from apps/web/src/app/api/checkout/create/route.ts through the service
-- client. anon could move current_uses by any amount, including negative, which
-- would defeat a max_uses cap.
REVOKE EXECUTE ON FUNCTION public.increment_promo_code_usage(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_promo_code_usage(uuid, integer) TO service_role;

-- Same body as 028_marketing_system.sql, with every name schema-qualified so the
-- search_path can be pinned to empty. Without this, pg_temp is searched first and a
-- caller could shadow promo_codes with a temp table.
CREATE OR REPLACE FUNCTION public.increment_promo_code_usage(
  p_promo_id uuid,
  p_increment integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_max_uses integer;
  v_current_uses integer;
BEGIN
  SELECT p.max_uses, p.current_uses INTO v_max_uses, v_current_uses
  FROM public.promo_codes p
  WHERE p.id = p_promo_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_max_uses IS NOT NULL AND v_current_uses + p_increment > v_max_uses THEN
    RETURN false;
  END IF;

  UPDATE public.promo_codes p
  SET current_uses = p.current_uses + p_increment
  WHERE p.id = p_promo_id;

  RETURN true;
END;
$$;

-- ── Channel / legacy import RPCs ──────────────────────────────────────────────
-- SECURITY INVOKER, reached only from webhooks and admin import scripts running as
-- service_role. anon/authenticated can only make them fail under RLS: the BEFORE
-- INSERT display-code trigger runs first, but its reservation rolls back with the
-- failed statement, so the only cost is a briefly held row lock.
REVOKE EXECUTE ON FUNCTION public.import_channel_order(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_channel_order(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.import_legacy_order(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_channel_order(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_channel_order(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_order(jsonb) TO service_role;

-- ── Customer default address / contact ────────────────────────────────────────
-- Called from the mobile app as an authenticated user
-- (apps/mobile/lib/features/profile/data/profile_repository.dart). Both functions
-- trusted p_customer_id outright and, being SECURITY DEFINER, RLS never applied —
-- so any caller could flip another customer's default when they knew both ids.
-- Rewritten to require ownership, with a service_role bypass for service-key callers.
-- The bypass reads auth.role(), so a raw psql or SQL-editor session (no
-- request.jwt.claims) is denied even as postgres; every app caller sends either a
-- service key or a user JWT, so neither is affected.

CREATE OR REPLACE FUNCTION public.set_default_address(p_customer_id uuid, p_address_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (SELECT 1 FROM public.customers c
                     WHERE c.id = p_customer_id AND c.auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to change defaults for customer %', p_customer_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.customer_addresses
  SET is_default = false, updated_at = now()
  WHERE customer_id = p_customer_id AND is_default = true;

  UPDATE public.customer_addresses
  SET is_default = true, updated_at = now()
  WHERE id = p_address_id AND customer_id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Address % not found for customer %', p_address_id, p_customer_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_contact(p_customer_id uuid, p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (SELECT 1 FROM public.customers c
                     WHERE c.id = p_customer_id AND c.auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to change defaults for customer %', p_customer_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.customer_contacts
  SET is_default = false, updated_at = now()
  WHERE customer_id = p_customer_id AND is_default = true;

  UPDATE public.customer_contacts
  SET is_default = true, updated_at = now()
  WHERE id = p_contact_id AND customer_id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found for customer %', p_contact_id, p_customer_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_default_address(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_default_contact(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_address(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_default_contact(uuid, uuid) TO authenticated, service_role;

COMMIT;
