-- Run only on a disposable or local test database. All fixtures are rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

-- Policy inventory: only the intended admin/manager and service-role write
-- policies remain; the legacy auth_* policies are gone.
SELECT is(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('categories', 'menu_items', 'modifier_groups', 'modifiers', 'menu_item_modifier_groups')
     AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')),
  10::bigint,
  'exactly 10 write policies remain on the five menu tables'
);
SELECT is(
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('categories', 'menu_items', 'modifier_groups', 'modifiers', 'menu_item_modifier_groups')
     AND (policyname LIKE 'admin_or_manager_all_%' OR policyname LIKE 'service_role_all_%')),
  10::bigint,
  'the 10 remaining write policies are admin/manager and service-role'
);

-- A service claim is required even when the fixture connection bypasses RLS.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.categories (id, name) VALUES ('11111111-0000-0000-0000-000000000001', 'security fixture');
INSERT INTO public.menu_items (id, category_id, name, price_cents) VALUES ('11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'security fixture', 100);
INSERT INTO public.modifier_groups (id, name) VALUES ('11111111-0000-0000-0000-000000000003', 'security fixture');
INSERT INTO public.modifiers (id, modifier_group_id, name) VALUES ('11111111-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003', 'security fixture');
INSERT INTO public.menu_item_modifier_groups (id, menu_item_id, modifier_group_id) VALUES ('11111111-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003');

CREATE FUNCTION pg_temp.affected(sql text, archive_sql text DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  EXECUTE sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- Archival triggers suppress DELETE and update the existing row instead.
  IF n = 0 AND archive_sql IS NOT NULL THEN
    EXECUTE archive_sql INTO n;
  END IF;
  -- Roll back each probe, including cascades, while retaining its row count.
  RAISE EXCEPTION USING ERRCODE = 'P9999';
EXCEPTION WHEN SQLSTATE 'P9999' THEN
  RETURN n;
WHEN insufficient_privilege OR raise_exception THEN
  RETURN -1;
END $$;

-- Execute each operation against real RLS policies and triggers. A denied
-- UPDATE/DELETE can filter every row rather than raising an exception.
CREATE FUNCTION pg_temp.check_menu_writes(actor text, allowed boolean) RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE r record; actual integer; delete_sql text; archive_sql text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('categories', 'INSERT INTO public.categories (id,name) VALUES (''22222222-0000-0000-0000-000000000001'',''security probe'')', 'UPDATE public.categories SET name=''security changed'' WHERE id=''11111111-0000-0000-0000-000000000001''', 'DELETE FROM public.categories WHERE id=''22222222-0000-0000-0000-000000000001'''),
    ('menu_items', 'INSERT INTO public.menu_items (id,category_id,name,price_cents) VALUES (''22222222-0000-0000-0000-000000000002'',''11111111-0000-0000-0000-000000000001'',''security probe'',100)', 'UPDATE public.menu_items SET name=''security changed'' WHERE id=''11111111-0000-0000-0000-000000000002''', 'DELETE FROM public.menu_items WHERE id=''22222222-0000-0000-0000-000000000002'''),
    ('modifier_groups', 'INSERT INTO public.modifier_groups (id,name) VALUES (''22222222-0000-0000-0000-000000000003'',''security probe'')', 'UPDATE public.modifier_groups SET name=''security changed'' WHERE id=''11111111-0000-0000-0000-000000000003''', 'DELETE FROM public.modifier_groups WHERE id=''22222222-0000-0000-0000-000000000003'''),
    ('modifiers', 'INSERT INTO public.modifiers (id,modifier_group_id,name) VALUES (''22222222-0000-0000-0000-000000000004'',''11111111-0000-0000-0000-000000000003'',''security probe'')', 'UPDATE public.modifiers SET name=''security changed'' WHERE id=''11111111-0000-0000-0000-000000000004''', 'DELETE FROM public.modifiers WHERE id=''22222222-0000-0000-0000-000000000004'''),
    ('menu_item_modifier_groups', 'INSERT INTO public.menu_item_modifier_groups (id,menu_item_id,modifier_group_id) VALUES (''22222222-0000-0000-0000-000000000005'',''11111111-0000-0000-0000-000000000002'',''11111111-0000-0000-0000-000000000003'')', 'UPDATE public.menu_item_modifier_groups SET is_required=true WHERE id=''11111111-0000-0000-0000-000000000005''', 'DELETE FROM public.menu_item_modifier_groups WHERE id=''11111111-0000-0000-0000-000000000005''')
  ) AS q(table_name, insert_sql, update_sql, delete_sql) LOOP
    -- The join table fixture already occupies the unique (item,group) pair;
    -- create a second group for its insert in the surrounding fixture below.
    IF r.table_name = 'menu_item_modifier_groups' THEN
      r.insert_sql := replace(r.insert_sql, '11111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000006');
      r.delete_sql := replace(r.delete_sql, '11111111-0000-0000-0000-000000000005', '22222222-0000-0000-0000-000000000005');
    END IF;
    actual := pg_temp.affected(r.insert_sql);
    RETURN NEXT is(actual, CASE WHEN allowed THEN 1 ELSE -1 END, actor || ' insert ' || r.table_name);
    actual := pg_temp.affected(r.update_sql);
    RETURN NEXT is(actual, CASE WHEN allowed THEN 1 ELSE 0 END, actor || ' update ' || r.table_name);
    delete_sql := replace(r.delete_sql, '22222222-', '11111111-');
    archive_sql := NULL;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.' || r.table_name) AND attname = 'archived_at' AND NOT attisdropped) THEN
      archive_sql := replace(delete_sql, 'DELETE FROM', 'SELECT count(*) FROM') || ' AND archived_at IS NOT NULL';
    END IF;
    actual := pg_temp.affected(delete_sql, archive_sql);
    RETURN NEXT is(actual, CASE WHEN allowed THEN 1 ELSE 0 END, actor || ' delete ' || r.table_name);
  END LOOP;
END $$;
INSERT INTO public.modifier_groups (id, name) VALUES ('11111111-0000-0000-0000-000000000006', 'security fixture second group');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SELECT * FROM pg_temp.check_menu_writes('roleless', false);
RESET ROLE;
-- Confirm no roleless operation changed or removed the fixtures.
SELECT is((SELECT count(*) FROM public.categories WHERE id='11111111-0000-0000-0000-000000000001' AND name='security fixture'), 1::bigint, 'roleless cannot mutate category');
SELECT is((SELECT count(*) FROM public.menu_items WHERE id='11111111-0000-0000-0000-000000000002' AND name='security fixture'), 1::bigint, 'roleless cannot mutate item');
SELECT is((SELECT count(*) FROM public.modifier_groups WHERE id='11111111-0000-0000-0000-000000000003' AND name='security fixture'), 1::bigint, 'roleless cannot mutate group');
SELECT is((SELECT count(*) FROM public.modifiers WHERE id='11111111-0000-0000-0000-000000000004' AND name='security fixture'), 1::bigint, 'roleless cannot mutate modifier');
SELECT is((SELECT count(*) FROM public.menu_item_modifier_groups WHERE id='11111111-0000-0000-0000-000000000005' AND NOT is_required), 1::bigint, 'roleless cannot mutate join');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"cashier"}}', true);
SELECT * FROM pg_temp.check_menu_writes('cashier', false);
SELECT set_config('request.jwt.claims', '', true);
SELECT * FROM pg_temp.check_menu_writes('null claims', false);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"admin"}}', true);
SELECT * FROM pg_temp.check_menu_writes('admin', true);
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated","app_metadata":{"role":"manager"}}', true);
SELECT * FROM pg_temp.check_menu_writes('manager', true);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT * FROM pg_temp.check_menu_writes('service_role', true);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT * FROM pg_temp.check_menu_writes('anonymous', false);
SELECT is((SELECT count(*) FROM public.categories WHERE id='11111111-0000-0000-0000-000000000001'), 1::bigint, 'anonymous reads categories');
SELECT is((SELECT count(*) FROM public.menu_items WHERE id='11111111-0000-0000-0000-000000000002'), 1::bigint, 'anonymous reads menu items');
SELECT is((SELECT count(*) FROM public.modifier_groups WHERE id='11111111-0000-0000-0000-000000000003'), 1::bigint, 'anonymous reads modifier groups');
SELECT is((SELECT count(*) FROM public.modifiers WHERE id='11111111-0000-0000-0000-000000000004'), 1::bigint, 'anonymous reads modifiers');
SELECT is((SELECT count(*) FROM public.menu_item_modifier_groups WHERE id='11111111-0000-0000-0000-000000000005'), 1::bigint, 'anonymous reads menu item modifier groups');
RESET ROLE;

-- Superuser bypasses RLS, so these exercise the trigger itself.
SELECT set_config('request.jwt.claims', '{}', true);
SELECT throws_ok($$INSERT INTO public.categories (name) VALUES ('null claims')$$, 'P0001', NULL, 'trigger rejects null claims on insert');
SELECT throws_ok($$UPDATE public.categories SET name='null claims' WHERE id='11111111-0000-0000-0000-000000000001'$$, 'P0001', NULL, 'trigger rejects null claims on update');
SELECT throws_ok($$DELETE FROM public.categories WHERE id='11111111-0000-0000-0000-000000000001'$$, 'P0001', NULL, 'trigger rejects null claims on delete categories');
SELECT throws_ok($$DELETE FROM public.menu_items WHERE id='11111111-0000-0000-0000-000000000002'$$, 'P0001', NULL, 'trigger rejects null claims on delete menu_items');
SELECT throws_ok($$DELETE FROM public.modifier_groups WHERE id='11111111-0000-0000-0000-000000000003'$$, 'P0001', NULL, 'trigger rejects null claims on delete modifier_groups');
SELECT throws_ok($$DELETE FROM public.modifiers WHERE id='11111111-0000-0000-0000-000000000004'$$, 'P0001', NULL, 'trigger rejects null claims on delete modifiers');
SELECT throws_ok($$DELETE FROM public.menu_item_modifier_groups WHERE id='11111111-0000-0000-0000-000000000005'$$, 'P0001', NULL, 'trigger rejects null claims on delete menu_item_modifier_groups');
SELECT set_config('request.jwt.claims', '', true);
SELECT throws_ok($$INSERT INTO public.categories (name) VALUES ('absent claims')$$, 'P0001', NULL, 'trigger rejects absent JWT');
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok($$INSERT INTO public.categories (name) VALUES ('missing app role')$$, 'P0001', NULL, 'trigger rejects missing app role');
SELECT throws_ok($$UPDATE public.categories SET name='missing app role' WHERE id='11111111-0000-0000-0000-000000000001'$$, 'P0001', NULL, 'trigger rejects missing app role on update');
SELECT throws_ok($$DELETE FROM public.menu_item_modifier_groups WHERE id='11111111-0000-0000-0000-000000000005'$$, 'P0001', NULL, 'trigger rejects missing app role on delete');
SELECT is((SELECT name FROM public.categories WHERE id='11111111-0000-0000-0000-000000000001'), 'security fixture', 'trigger denials leave category unchanged');
SELECT is((SELECT count(*) FROM public.menu_item_modifier_groups WHERE id='11111111-0000-0000-0000-000000000005'), 1::bigint, 'trigger denials leave join unchanged');

-- 20261126132000's RPC must reject null claims with insufficient_privilege.
SELECT CASE
  WHEN to_regprocedure('public.replace_item_modifier_groups(uuid,jsonb)') IS NOT NULL THEN
    throws_ok(
      $$SELECT * FROM public.replace_item_modifier_groups('11111111-0000-0000-0000-000000000002'::uuid, '[]'::jsonb)$$,
      '42501', NULL, 'replace_item_modifier_groups rejects null claims')
  ELSE ok(true, 'replace_item_modifier_groups not installed; null-claim check skipped')
END;

SELECT ok(NOT has_table_privilege(role_name, format('public.%I', table_name), privilege), role_name || ' lacks ' || privilege || ' on ' || table_name)
FROM unnest(ARRAY['anon','authenticated']) role_name
CROSS JOIN unnest(ARRAY['categories','menu_items','modifier_groups','modifiers','menu_item_modifier_groups']) table_name
CROSS JOIN unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER']) privilege;
SELECT ok(NOT has_table_privilege(role_name, format('public.%I', table_name), privilege), role_name || ' lacks ' || privilege || ' on ' || table_name)
FROM unnest(ARRAY['anon','authenticated']) role_name
CROSS JOIN unnest(ARRAY['channel_categories','channel_products','channel_modifiers']) table_name
CROSS JOIN unnest(ARRAY['TRUNCATE','REFERENCES','TRIGGER']) privilege;

SELECT is((SELECT proconfig FROM pg_proc WHERE oid='public.validate_admin_write()'::regprocedure) @> ARRAY['search_path=""'], true, 'validate_admin_write has empty search_path');
SELECT is((SELECT proconfig FROM pg_proc WHERE oid='public.is_admin_or_manager()'::regprocedure) @> ARRAY['search_path=""'], true, 'is_admin_or_manager has empty search_path');
SELECT CASE
  WHEN to_regprocedure('public.archive_menu_entity()') IS NOT NULL THEN
    ok(NOT has_function_privilege('anon', 'public.archive_menu_entity()', 'EXECUTE'), 'anon cannot execute archive_menu_entity')
  ELSE ok(true, 'archive_menu_entity not installed; execute check skipped')
END;
SELECT CASE
  WHEN to_regprocedure('public.archive_menu_entity()') IS NOT NULL THEN
    ok(NOT has_function_privilege('authenticated', 'public.archive_menu_entity()', 'EXECUTE'), 'authenticated cannot execute archive_menu_entity')
  ELSE ok(true, 'archive_menu_entity not installed; execute check skipped')
END;
SELECT * FROM finish();
ROLLBACK;
