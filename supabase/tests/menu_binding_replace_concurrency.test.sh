#!/usr/bin/env bash
# Two real database connections prove that concurrent replacements for one item
# serialize on the advisory lock instead of interleaving their DELETE/INSERT.
# Runs in a throwaway database so it never touches the dev database's schema.
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_oxtauhhixztusjlxcipo}"
DB=menu_binding_concurrency
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL=(docker exec -i "$CONTAINER" psql -X -U postgres -v ON_ERROR_STOP=1 -q -t)

admin() { "${PSQL[@]}" -d "$DB" "$@"; }

fail() { echo "not ok - $1"; exit 1; }

"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null

# Minimal stand-ins for the parts of the real schema these migrations rely on.
"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
CREATE FUNCTION public.is_admin_or_manager() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TABLE public.categories (id uuid PRIMARY KEY, name text, description text, sort_order integer, is_active boolean DEFAULT true);
CREATE TABLE public.menu_items (id uuid PRIMARY KEY, category_id uuid REFERENCES public.categories(id), name text, description text, price_cents integer, image_url text, is_available boolean DEFAULT true, snooze_till timestamptz, sort_order integer);
CREATE TABLE public.modifier_groups (id uuid PRIMARY KEY, name text, min_selections integer DEFAULT 0, max_selections integer DEFAULT 1, sort_order integer);
CREATE TABLE public.modifiers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), modifier_group_id uuid REFERENCES public.modifier_groups(id), name text, price_delta_cents integer, is_available boolean DEFAULT true, sort_order integer);
CREATE TABLE public.menu_item_modifier_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), menu_item_id uuid REFERENCES public.menu_items(id), modifier_group_id uuid REFERENCES public.modifier_groups(id), is_required boolean DEFAULT false, created_at timestamptz DEFAULT now(), UNIQUE (menu_item_id, modifier_group_id));
CREATE TABLE public.channel_products (menu_item_id uuid, channel text, external_item_id text, external_name text, price_cents integer, is_available boolean, snooze_till timestamptz);
CREATE TABLE public.channel_categories (category_id uuid, channel text, external_category_id text);
CREATE TABLE public.channel_modifiers (modifier_id uuid, channel text, price_cents integer);
SQL

for migration in 20261126130000_grabfood_menu_refresh 20261126131000_menu_archival 20261126140000_menu_write_security 20261126132000_atomic_item_modifier_groups; do
  "${PSQL[@]}" -d "$DB" < "$ROOT/supabase/migrations/$migration.sql" >/dev/null
done

"${PSQL[@]}" -d "$DB" >/dev/null <<'SQL'
INSERT INTO public.categories (id, name) VALUES ('55111111-0000-0000-0000-000000000001', 'concurrency');
INSERT INTO public.menu_items (id, category_id, name, price_cents) VALUES ('55111111-0000-0000-0000-000000000002', '55111111-0000-0000-0000-000000000001', 'concurrency', 100);
INSERT INTO public.modifier_groups (id, name) VALUES ('55111111-0000-0000-0000-000000000003', 'first'), ('55111111-0000-0000-0000-000000000004', 'second');
INSERT INTO public.modifiers (modifier_group_id, name) VALUES ('55111111-0000-0000-0000-000000000003', 'first option'), ('55111111-0000-0000-0000-000000000004', 'second option');
SQL

session() {
  "${PSQL[@]}" -d "$DB" -c "SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false)" \
    -c "BEGIN" \
    -c "SELECT count(*) FROM public.replace_item_modifier_groups('55111111-0000-0000-0000-000000000002', '[{\"modifier_group_id\":\"$1\",\"is_required\":false}]'::jsonb)" \
    -c "SELECT pg_sleep($2)" \
    -c "COMMIT"
}

session 55111111-0000-0000-0000-000000000003 2 >/tmp/menu_binding_holder.log 2>&1 &
holder=$!
sleep 0.7
session 55111111-0000-0000-0000-000000000004 0 >/tmp/menu_binding_waiter.log 2>&1 &
waiter=$!
sleep 0.5

waiting=$("${PSQL[@]}" -d "$DB" -c "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted" | tr -d '[:space:]')
[ "$waiting" = "1" ] || fail "second replacement did not wait for the item lock (blocked advisory locks: $waiting)"

wait "$holder" || fail "first replacement failed"
wait "$waiter" || fail "second replacement failed"

groups=$("${PSQL[@]}" -d "$DB" -c "SELECT string_agg(modifier_group_id::text, ',' ORDER BY modifier_group_id) FROM public.menu_item_modifier_groups WHERE menu_item_id = '55111111-0000-0000-0000-000000000002'" | tr -d '[:space:]')
[ "$groups" = "55111111-0000-0000-0000-000000000004" ] || fail "bindings were merged instead of replaced (got: $groups)"

echo "ok - concurrent replacements serialize and the last writer owns the binding set"
"${PSQL[@]}" -d postgres -c "DROP DATABASE $DB" >/dev/null
