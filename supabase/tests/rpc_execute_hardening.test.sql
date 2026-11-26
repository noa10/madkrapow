-- Verifies the EXECUTE grants narrowed by 20261127101500_rpc_execute_hardening.sql.
--
-- Run only on a disposable or local test database. All fixtures are rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(74);

-- ── anon loses every helper it never needed ───────────────────────────────────
-- get_schema_info / get_enum_types exist only in the hosted project, not in a fresh
-- replay of the migration history, so those two assertions pass vacuously when the
-- function is absent (a clean database) and are real on the hosted project.
SELECT ok(CASE WHEN to_regprocedure('public.get_schema_info()') IS NULL THEN true
               ELSE NOT has_function_privilege('anon', 'public.get_schema_info()', 'EXECUTE') END,
  'anon cannot execute get_schema_info');
SELECT ok(CASE WHEN to_regprocedure('public.get_enum_types()') IS NULL THEN true
               ELSE NOT has_function_privilege('anon', 'public.get_enum_types()', 'EXECUTE') END,
  'anon cannot execute get_enum_types');
SELECT ok(NOT has_function_privilege('anon', 'public.cleanup_order_display_codes(integer)', 'EXECUTE'),
  'anon cannot execute cleanup_order_display_codes');
SELECT ok(NOT has_function_privilege('anon', 'public.reserve_order_display_code(date)', 'EXECUTE'),
  'anon cannot execute reserve_order_display_code');
SELECT ok(NOT has_function_privilege('anon', 'public.increment_promo_code_usage(uuid, integer)', 'EXECUTE'),
  'anon cannot execute increment_promo_code_usage');
SELECT ok(NOT has_function_privilege('anon', 'public.import_channel_order(jsonb)', 'EXECUTE'),
  'anon cannot execute import_channel_order');
SELECT ok(NOT has_function_privilege('anon', 'public.apply_channel_order(jsonb)', 'EXECUTE'),
  'anon cannot execute apply_channel_order');
SELECT ok(NOT has_function_privilege('anon', 'public.import_legacy_order(jsonb)', 'EXECUTE'),
  'anon cannot execute import_legacy_order');

-- ── nor does a signed-in user ─────────────────────────────────────────────────
SELECT ok(CASE WHEN to_regprocedure('public.get_schema_info()') IS NULL THEN true
               ELSE NOT has_function_privilege('authenticated', 'public.get_schema_info()', 'EXECUTE') END,
  'authenticated cannot execute get_schema_info');
SELECT ok(CASE WHEN to_regprocedure('public.get_enum_types()') IS NULL THEN true
               ELSE NOT has_function_privilege('authenticated', 'public.get_enum_types()', 'EXECUTE') END,
  'authenticated cannot execute get_enum_types');
SELECT ok(NOT has_function_privilege('authenticated', 'public.cleanup_order_display_codes(integer)', 'EXECUTE'),
  'authenticated cannot execute cleanup_order_display_codes');
SELECT ok(NOT has_function_privilege('authenticated', 'public.reserve_order_display_code(date)', 'EXECUTE'),
  'authenticated cannot execute reserve_order_display_code');
SELECT ok(NOT has_function_privilege('authenticated', 'public.increment_promo_code_usage(uuid, integer)', 'EXECUTE'),
  'authenticated cannot execute increment_promo_code_usage');
SELECT ok(NOT has_function_privilege('authenticated', 'public.import_channel_order(jsonb)', 'EXECUTE'),
  'authenticated cannot execute import_channel_order');
SELECT ok(NOT has_function_privilege('authenticated', 'public.apply_channel_order(jsonb)', 'EXECUTE'),
  'authenticated cannot execute apply_channel_order');
SELECT ok(NOT has_function_privilege('authenticated', 'public.import_legacy_order(jsonb)', 'EXECUTE'),
  'authenticated cannot execute import_legacy_order');

-- ── service_role keeps every one of them ──────────────────────────────────────
SELECT ok(CASE WHEN to_regprocedure('public.get_schema_info()') IS NULL THEN true
               ELSE has_function_privilege('service_role', 'public.get_schema_info()', 'EXECUTE') END,
  'service_role can execute get_schema_info');
SELECT ok(CASE WHEN to_regprocedure('public.get_enum_types()') IS NULL THEN true
               ELSE has_function_privilege('service_role', 'public.get_enum_types()', 'EXECUTE') END,
  'service_role can execute get_enum_types');
SELECT ok(has_function_privilege('service_role', 'public.cleanup_order_display_codes(integer)', 'EXECUTE'),
  'service_role can execute cleanup_order_display_codes');
SELECT ok(has_function_privilege('service_role', 'public.reserve_order_display_code(date)', 'EXECUTE'),
  'service_role can execute reserve_order_display_code');
SELECT ok(has_function_privilege('service_role', 'public.increment_promo_code_usage(uuid, integer)', 'EXECUTE'),
  'service_role can execute increment_promo_code_usage');
SELECT ok(has_function_privilege('service_role', 'public.import_channel_order(jsonb)', 'EXECUTE'),
  'service_role can execute import_channel_order');
SELECT ok(has_function_privilege('service_role', 'public.apply_channel_order(jsonb)', 'EXECUTE'),
  'service_role can execute apply_channel_order');
SELECT ok(has_function_privilege('service_role', 'public.import_legacy_order(jsonb)', 'EXECUTE'),
  'service_role can execute import_legacy_order');

-- ── customer default helpers: authenticated only ──────────────────────────────
SELECT ok(NOT has_function_privilege('anon', 'public.set_default_address(uuid, uuid)', 'EXECUTE'),
  'anon cannot execute set_default_address');
SELECT ok(NOT has_function_privilege('anon', 'public.set_default_contact(uuid, uuid)', 'EXECUTE'),
  'anon cannot execute set_default_contact');
SELECT ok(has_function_privilege('authenticated', 'public.set_default_address(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute set_default_address');
SELECT ok(has_function_privilege('authenticated', 'public.set_default_contact(uuid, uuid)', 'EXECUTE'),
  'authenticated can execute set_default_contact');

-- ── is_admin_or_manager stays callable: RLS policies depend on it ─────────────
SELECT ok(has_function_privilege('anon', 'public.is_admin_or_manager()', 'EXECUTE'),
  'anon can still execute is_admin_or_manager (RLS policies call it)');
SELECT ok(has_function_privilege('authenticated', 'public.is_admin_or_manager()', 'EXECUTE'),
  'authenticated can still execute is_admin_or_manager (RLS policies call it)');

-- ── fixtures ──────────────────────────────────────────────────────────────────
INSERT INTO public.customers (id, auth_user_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

INSERT INTO public.customer_addresses
  (id, customer_id, address_line1, city, state, postal_code, is_default) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '1 Owner Street', 'Kuala Lumpur', 'WP', '50000', true),
  ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   '2 Owner Street', 'Kuala Lumpur', 'WP', '50000', false),
  ('b1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   '1 Other Street', 'Kuala Lumpur', 'WP', '50000', true),
  ('b2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '2 Other Street', 'Kuala Lumpur', 'WP', '50000', false);

INSERT INTO public.customer_contacts (id, customer_id, name, phone, is_default) VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   'Owner Primary', '+60111111111', true),
  ('d2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Owner Backup', '+60111111112', false),
  ('e1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
   'Other Primary', '+60222222222', true);

-- ── address ownership ────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.set_default_address('11111111-1111-1111-1111-111111111111',
                                       'a2222222-2222-2222-2222-222222222222') $$,
  'owner can switch their own default address');

SELECT throws_ok(
  $$ SELECT public.set_default_address('22222222-2222-2222-2222-222222222222',
                                       'b1111111-1111-1111-1111-111111111111') $$,
  '42501',
  'Not authorized to change defaults for customer 22222222-2222-2222-2222-222222222222',
  'a signed-in customer cannot change another customer''s default address');

-- Ownership passes, but the address belongs to someone else: the original
-- "not found for customer" contract still applies.
SELECT throws_ok(
  $$ SELECT public.set_default_address('11111111-1111-1111-1111-111111111111',
                                       'b2222222-2222-2222-2222-222222222222') $$,
  'P0001',
  'Address b2222222-2222-2222-2222-222222222222 not found for customer 11111111-1111-1111-1111-111111111111',
  'an owner cannot point their default at an address they do not own');

RESET ROLE;

SELECT is((SELECT is_default FROM public.customer_addresses
           WHERE id = 'a1111111-1111-1111-1111-111111111111'), false,
  'the previous default address was cleared');
SELECT is((SELECT is_default FROM public.customer_addresses
           WHERE id = 'a2222222-2222-2222-2222-222222222222'), true,
  'the requested address became the default');
SELECT is((SELECT is_default FROM public.customer_addresses
           WHERE id = 'b1111111-1111-1111-1111-111111111111'), true,
  'the rejected call left the other customer''s default untouched');
SELECT is((SELECT is_default FROM public.customer_addresses
           WHERE id = 'a2222222-2222-2222-2222-222222222222'), true,
  'the not-found call rolled back its own default clearing');
SELECT is((SELECT is_default FROM public.customer_addresses
           WHERE id = 'a1111111-1111-1111-1111-111111111111'), false,
  'the not-found call did not resurrect the old default');

-- ── contact ownership (same contract, same gate) ─────────────────────────────
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.set_default_contact('11111111-1111-1111-1111-111111111111',
                                       'd2222222-2222-2222-2222-222222222222') $$,
  'owner can switch their own default contact');

SELECT throws_ok(
  $$ SELECT public.set_default_contact('22222222-2222-2222-2222-222222222222',
                                       'e1111111-1111-1111-1111-111111111111') $$,
  '42501',
  'Not authorized to change defaults for customer 22222222-2222-2222-2222-222222222222',
  'a signed-in customer cannot change another customer''s default contact');

RESET ROLE;

SELECT is((SELECT is_default FROM public.customer_contacts
           WHERE id = 'd1111111-1111-1111-1111-111111111111'), false,
  'the previous default contact was cleared');
SELECT is((SELECT is_default FROM public.customer_contacts
           WHERE id = 'd2222222-2222-2222-2222-222222222222'), true,
  'the requested contact became the default');
SELECT is((SELECT is_default FROM public.customer_contacts
           WHERE id = 'e1111111-1111-1111-1111-111111111111'), true,
  'the rejected call left the other customer''s default contact untouched');

-- Ownership passes, but the contact belongs to someone else: the same
-- "not found for customer" contract as the address function.
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$ SELECT public.set_default_contact('11111111-1111-1111-1111-111111111111',
                                       'e1111111-1111-1111-1111-111111111111') $$,
  'P0001',
  'Contact e1111111-1111-1111-1111-111111111111 not found for customer 11111111-1111-1111-1111-111111111111',
  'an owner cannot point their default at a contact they do not own');

RESET ROLE;

SELECT is((SELECT is_default FROM public.customer_contacts
           WHERE id = 'd2222222-2222-2222-2222-222222222222'), true,
  'the contact not-found call rolled back its own default clearing');
SELECT is((SELECT is_default FROM public.customer_contacts
           WHERE id = 'd1111111-1111-1111-1111-111111111111'), false,
  'the contact not-found call did not resurrect the old default');

-- ── service_role keeps an administrative bypass (no JWT sub, role in claims) ──
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ SELECT public.set_default_address('22222222-2222-2222-2222-222222222222',
                                       'b2222222-2222-2222-2222-222222222222') $$,
  'service_role can switch any customer''s default address');

RESET ROLE;

SELECT is((SELECT is_default FROM public.customer_addresses
           WHERE id = 'b2222222-2222-2222-2222-222222222222'), true,
  'the service_role call moved the other customer''s default');
SELECT is((SELECT is_default FROM public.customer_addresses
           WHERE id = 'b1111111-1111-1111-1111-111111111111'), false,
  'the service_role call cleared the previous default');

-- The bypass reads auth.role(), so a session with no JWT claims is denied even while
-- running as service_role: a raw psql or SQL-editor admin tool must set
-- request.jwt.claims itself before calling these helpers.
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$ SELECT public.set_default_address('11111111-1111-1111-1111-111111111111',
                                       'a1111111-1111-1111-1111-111111111111') $$,
  '42501',
  'Not authorized to change defaults for customer 11111111-1111-1111-1111-111111111111',
  'a service_role session without JWT claims is denied');

RESET ROLE;

-- ── the rewritten promo counter still behaves like 028_marketing_system.sql ──
INSERT INTO public.promo_codes (id, code, discount_type, discount_value, max_uses, current_uses) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'PROMO-OPEN', 'fixed', 100, 2, 0),
  ('c2222222-2222-2222-2222-222222222222', 'PROMO-CAPPED', 'fixed', 100, 1, 1),
  ('c4444444-4444-4444-4444-444444444444', 'PROMO-UNLIMITED', 'fixed', 100, NULL, 0),
  ('c5555555-5555-5555-5555-555555555555', 'PROMO-BULK', 'fixed', 100, 10, 0);

SET LOCAL ROLE service_role;

SELECT is(public.increment_promo_code_usage('c1111111-1111-1111-1111-111111111111'), true,
  'a promo with headroom still increments');
SELECT is((SELECT current_uses FROM public.promo_codes
           WHERE id = 'c1111111-1111-1111-1111-111111111111'), 1,
  'the counter advanced by one');
SELECT is(public.increment_promo_code_usage('c2222222-2222-2222-2222-222222222222'), false,
  'a promo at max_uses still refuses');
SELECT is((SELECT current_uses FROM public.promo_codes
           WHERE id = 'c2222222-2222-2222-2222-222222222222'), 1,
  'the capped counter did not move');
SELECT is(public.increment_promo_code_usage('c3333333-3333-3333-3333-333333333333'), false,
  'an unknown promo id still returns false');
SELECT is(public.increment_promo_code_usage('c4444444-4444-4444-4444-444444444444', 5), true,
  'a promo with no max_uses accepts a multi-use increment');
SELECT is((SELECT current_uses FROM public.promo_codes
           WHERE id = 'c4444444-4444-4444-4444-444444444444'), 5,
  'the unlimited counter advanced by the requested amount');
SELECT is(public.increment_promo_code_usage('c5555555-5555-5555-5555-555555555555', 3), true,
  'a capped promo still accepts an increment that fits');
SELECT is((SELECT current_uses FROM public.promo_codes
           WHERE id = 'c5555555-5555-5555-5555-555555555555'), 3,
  'the bulk counter advanced by three');
SELECT is(public.increment_promo_code_usage('c5555555-5555-5555-5555-555555555555', -1), true,
  'a negative increment is applied (service_role callers only)');
SELECT is((SELECT current_uses FROM public.promo_codes
           WHERE id = 'c5555555-5555-5555-5555-555555555555'), 2,
  'the negative increment reduced the counter');

RESET ROLE;

-- ── no PUBLIC grant may remain on the rewritten helpers ──────────────────────
SELECT is(
  (SELECT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)
   FROM pg_proc p
   WHERE p.oid = 'public.set_default_address(uuid, uuid)'::regprocedure
     AND p.proacl IS NOT NULL),
  false, 'set_default_address has no PUBLIC grant');
SELECT is(
  (SELECT EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)
   FROM pg_proc p
   WHERE p.oid = 'public.set_default_contact(uuid, uuid)'::regprocedure
     AND p.proacl IS NOT NULL),
  false, 'set_default_contact has no PUBLIC grant');

-- ── the display-code reservation table is closed to end users ────────────────
-- Revoking EXECUTE is not enough: 047 never enabled RLS, so without this the anon
-- key can still write the table directly through PostgREST.
SELECT is((SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.order_display_codes'::regclass), true,
  'order_display_codes has RLS enabled');
SELECT ok(NOT has_table_privilege('anon', 'public.order_display_codes', 'SELECT'),
  'anon cannot select display codes');
SELECT ok(NOT has_table_privilege('anon', 'public.order_display_codes', 'INSERT'),
  'anon cannot insert display codes');
SELECT ok(NOT has_table_privilege('anon', 'public.order_display_codes', 'DELETE'),
  'anon cannot delete display codes');
SELECT ok(NOT has_table_privilege('authenticated', 'public.order_display_codes', 'INSERT'),
  'authenticated cannot insert display codes');

-- ── the three rewritten helpers keep definer rights ─────────────────────────
SELECT ok((SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.increment_promo_code_usage(uuid, integer)'::regprocedure),
  'increment_promo_code_usage is SECURITY DEFINER');
SELECT ok((SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.set_default_address(uuid, uuid)'::regprocedure),
  'set_default_address is SECURITY DEFINER');
SELECT ok((SELECT prosecdef FROM pg_proc
           WHERE oid = 'public.set_default_contact(uuid, uuid)'::regprocedure),
  'set_default_contact is SECURITY DEFINER');

-- ── SECURITY DEFINER helpers run with a pinned (empty) search_path ───────────
-- Empty, not public: pg_temp is searched first otherwise, which would let a caller
-- shadow a table name inside a definer-rights function.
SELECT ok(
  (SELECT proconfig FROM pg_proc
   WHERE oid = 'public.increment_promo_code_usage(uuid, integer)'::regprocedure)
  @> ARRAY['search_path=""'],
  'increment_promo_code_usage has a pinned search_path');
SELECT ok(
  (SELECT proconfig FROM pg_proc
   WHERE oid = 'public.set_default_address(uuid, uuid)'::regprocedure)
  @> ARRAY['search_path=""'],
  'set_default_address has a pinned search_path');
SELECT ok(
  (SELECT proconfig FROM pg_proc
   WHERE oid = 'public.set_default_contact(uuid, uuid)'::regprocedure)
  @> ARRAY['search_path=""'],
  'set_default_contact has a pinned search_path');

SELECT * FROM finish();
ROLLBACK;
