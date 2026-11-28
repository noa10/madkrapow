-- pgTAP coverage for public.claim_order_promos and the hardened
-- public.increment_promo_code_usage.
--
-- The whole file runs in one transaction and rolls back, so it is safe against
-- the shared local database. Fixtures use fixed UUIDs; failed claims run inside
-- pgTAP subtransactions and therefore cannot leak applications or counter moves.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(72);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

INSERT INTO public.promo_codes (
  id, code, discount_type, discount_value, scope, max_uses, current_uses,
  is_active, max_discount_cents, min_order_amount_cents, valid_from, valid_until
) VALUES
  -- Happy path: 25% off the order subtotal.
  ('a0000000-0000-0000-0000-000000000001', 'T-ORDER25', 'percentage', 25, 'order',
   10, 0, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  -- Happy path: RM 3 off delivery, capped at RM 2.
  ('a0000000-0000-0000-0000-000000000002', 'T-DELIV300', 'fixed', 300, 'delivery',
   10, 0, true, 200, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  -- Stale configurations.
  ('a0000000-0000-0000-0000-000000000003', 'T-EXPIRED', 'percentage', 10, 'order',
   10, 0, true, NULL, NULL, '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('a0000000-0000-0000-0000-000000000004', 'T-FUTURE', 'percentage', 10, 'order',
   10, 0, true, NULL, NULL, '2027-01-01T00:00:00Z', '2028-01-01T00:00:00Z'),
  ('a0000000-0000-0000-0000-000000000005', 'T-INACTIVE', 'percentage', 10, 'order',
   10, 0, false, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  ('a0000000-0000-0000-0000-000000000006', 'T-EXHAUSTED', 'percentage', 10, 'order',
   1, 1, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  ('a0000000-0000-0000-0000-000000000007', 'T-MINORDER', 'fixed', 100, 'order',
   10, 0, true, NULL, 2000, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  -- Open-ended validity windows are not part of the checkout snapshot.
  ('a0000000-0000-0000-0000-000000000008', 'T-NULLFROM', 'percentage', 10, 'order',
   10, 0, true, NULL, NULL, NULL, '2027-01-01T00:00:00Z'),
  ('a0000000-0000-0000-0000-000000000009', 'T-NULLUNTIL', 'percentage', 10, 'order',
   10, 0, true, NULL, NULL, '2026-01-01T00:00:00Z', NULL),
  -- Values large enough to overflow an integer before the cap is applied.
  ('a0000000-0000-0000-0000-00000000000a', 'T-HUGEPCT', 'percentage', 2000000000, 'order',
   10, 0, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  ('a0000000-0000-0000-0000-00000000000b', 'T-HUGEFIX', 'fixed', 2147483647, 'order',
   10, 0, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  -- Single-redemption promo used for cap atomicity.
  ('a0000000-0000-0000-0000-00000000000c', 'T-CAPONCE', 'fixed', 300, 'order',
   1, 0, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  -- Rollback pair: the first is valid, the second is exhausted. The valid one is
  -- locked and would be incremented before the failure, proving the rollback.
  ('a0000000-0000-0000-0000-00000000000d', 'T-ROLLBACKOK', 'percentage', 25, 'order',
   10, 0, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  ('a0000000-0000-0000-0000-00000000000e', 'T-ROLLBACKFULL', 'fixed', 100, 'order',
   1, 1, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  -- Direct increment_promo_code_usage coverage.
  ('a0000000-0000-0000-0000-00000000000f', 'T-INCREMENT', 'fixed', 100, 'order',
   10, 0, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z'),
  ('a0000000-0000-0000-0000-000000000010', 'T-INCCAP', 'fixed', 100, 'order',
   2, 0, true, NULL, NULL, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z');

INSERT INTO public.orders (
  id, order_number, display_code, subtotal_cents, delivery_fee_cents,
  discount_cents, total_cents, promo_code_id, status
) VALUES
  -- Happy path: order 25% of 1001 = 250, delivery fixed 300 capped at 200.
  ('b0000000-0000-0000-0000-000000000001', 'PROMO-T-01', 'PT01', 1001, 501,
   450, 1052, 'a0000000-0000-0000-0000-000000000001', 'pending'),
  ('b0000000-0000-0000-0000-000000000002', 'PROMO-T-02', 'PT02', 1001, 0,
   100, 901, 'a0000000-0000-0000-0000-000000000003', 'pending'),
  ('b0000000-0000-0000-0000-000000000003', 'PROMO-T-03', 'PT03', 1001, 0,
   100, 901, 'a0000000-0000-0000-0000-000000000004', 'pending'),
  ('b0000000-0000-0000-0000-000000000004', 'PROMO-T-04', 'PT04', 1001, 0,
   100, 901, 'a0000000-0000-0000-0000-000000000005', 'pending'),
  ('b0000000-0000-0000-0000-000000000005', 'PROMO-T-05', 'PT05', 1001, 0,
   100, 901, 'a0000000-0000-0000-0000-000000000006', 'pending'),
  ('b0000000-0000-0000-0000-000000000006', 'PROMO-T-06', 'PT06', 1001, 0,
   100, 901, 'a0000000-0000-0000-0000-000000000007', 'pending'),
  ('b0000000-0000-0000-0000-000000000007', 'PROMO-T-07', 'PT07', 1001, 0,
   100, 901, 'a0000000-0000-0000-0000-000000000008', 'pending'),
  ('b0000000-0000-0000-0000-000000000008', 'PROMO-T-08', 'PT08', 1001, 0,
   100, 901, 'a0000000-0000-0000-0000-000000000009', 'pending'),
  ('b0000000-0000-0000-0000-000000000009', 'PROMO-T-09', 'PT09', 1001, 0,
   100, 901, NULL, 'pending'),
  ('b0000000-0000-0000-0000-00000000000a', 'PROMO-T-10', 'PT10', 1001, 0,
   100, 901, 'a0000000-0000-0000-0000-000000000001', 'pending'),
  ('b0000000-0000-0000-0000-00000000000b', 'PROMO-T-11', 'PT11', 1001, 0,
   300, 701, 'a0000000-0000-0000-0000-000000000001', 'pending'),
  ('b0000000-0000-0000-0000-00000000000c', 'PROMO-T-12', 'PT12', 1001, 0,
   999, 2, 'a0000000-0000-0000-0000-000000000001', 'pending'),
  ('b0000000-0000-0000-0000-00000000000d', 'PROMO-T-13', 'PT13', 1001, 0,
   250, 751, 'a0000000-0000-0000-0000-00000000000c', 'pending'),
  ('b0000000-0000-0000-0000-00000000000e', 'PROMO-T-14', 'PT14', 1001, 0,
   250, 751, 'a0000000-0000-0000-0000-000000000001', 'paid'),
  ('b0000000-0000-0000-0000-00000000000f', 'PROMO-T-15', 'PT15', 1001, 0,
   500, 501, 'a0000000-0000-0000-0000-000000000001', 'pending'),
  ('b0000000-0000-0000-0000-000000000010', 'PROMO-T-16', 'PT16', 1001, 0,
   500, 501, 'a0000000-0000-0000-0000-000000000001', 'pending'),
  ('b0000000-0000-0000-0000-000000000011', 'PROMO-T-17', 'PT17', 1001, 0,
   350, 651, 'a0000000-0000-0000-0000-00000000000d', 'pending'),
  ('b0000000-0000-0000-0000-000000000012', 'PROMO-T-18', 'PT18', 1001, 0,
   1001, 0, 'a0000000-0000-0000-0000-00000000000a', 'pending'),
  ('b0000000-0000-0000-0000-000000000013', 'PROMO-T-19', 'PT19', 1001, 0,
   1001, 0, 'a0000000-0000-0000-0000-00000000000b', 'pending'),
  ('b0000000-0000-0000-0000-000000000014', 'PROMO-T-20', 'PT20', 1001, 0,
   300, 701, 'a0000000-0000-0000-0000-00000000000c', 'pending'),
  ('b0000000-0000-0000-0000-000000000015', 'PROMO-T-21', 'PT21', 1001, 0,
   300, 701, 'a0000000-0000-0000-0000-00000000000c', 'pending'),
  ('b0000000-0000-0000-0000-000000000016', 'PROMO-T-22', 'PT22', 1001, 0,
   0, 1001, NULL, 'pending');

-- ---------------------------------------------------------------------------
-- Signature, privileges, and definer hardening
-- ---------------------------------------------------------------------------

SELECT ok(
  has_function_privilege('service_role', 'public.claim_order_promos(uuid, jsonb)', 'EXECUTE'),
  'service_role may execute claim_order_promos');
SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_order_promos(uuid, jsonb)', 'EXECUTE'),
  'anon may not execute claim_order_promos');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.claim_order_promos(uuid, jsonb)', 'EXECUTE'),
  'authenticated may not execute claim_order_promos');
SELECT ok(
  has_function_privilege('service_role', 'public.increment_promo_code_usage(uuid, integer)', 'EXECUTE'),
  'service_role may execute increment_promo_code_usage');
SELECT ok(
  NOT has_function_privilege('anon', 'public.increment_promo_code_usage(uuid, integer)', 'EXECUTE'),
  'anon may not execute increment_promo_code_usage');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.increment_promo_code_usage(uuid, integer)', 'EXECUTE'),
  'authenticated may not execute increment_promo_code_usage');
SELECT is(
  (SELECT prorettype::regtype::text FROM pg_proc
   WHERE oid = 'public.claim_order_promos(uuid, jsonb)'::regprocedure),
  'void',
  'claim_order_promos returns void');
SELECT ok(
  (SELECT prosecdef FROM pg_proc
   WHERE oid = 'public.claim_order_promos(uuid, jsonb)'::regprocedure),
  'claim_order_promos is SECURITY DEFINER');
SELECT ok(
  (SELECT proconfig FROM pg_proc
   WHERE oid = 'public.claim_order_promos(uuid, jsonb)'::regprocedure)
  @> ARRAY['search_path=""'],
  'claim_order_promos has a pinned empty search_path');
SELECT ok(
  (SELECT proconfig FROM pg_proc
   WHERE oid = 'public.increment_promo_code_usage(uuid, integer)'::regprocedure)
  @> ARRAY['search_path=""'],
  'increment_promo_code_usage has a pinned empty search_path');

-- ---------------------------------------------------------------------------
-- Payload validation (before any lock or write)
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000001', '"nope"'::jsonb)$$,
  '22023', 'p_promos must be a JSON array',
  'a non-array payload is rejected as invalid input');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-00000000000f', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250},
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'a duplicate promo id is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000010', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250},
      {"promo_id":"a0000000-0000-0000-0000-00000000000f","scope":"order","discount_cents":250}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'a duplicate scope is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000001', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"item","discount_cents":250}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'an unsupported scope is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000001', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":0}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'a zero discount is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000001', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":-1}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'a negative discount is rejected');

-- NULL and [] both mean "nothing to claim" and are harmless no-ops.
SELECT lives_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000016', NULL)$$,
  'a NULL payload is a no-op');
SELECT lives_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000016', '[]'::jsonb)$$,
  'an empty payload is a no-op');
SELECT is(
  (SELECT count(*) FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000016'),
  0::bigint,
  'an empty claim writes no applications');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000099', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250}
    ]'::jsonb)$$,
  'P0002', 'order b0000000-0000-0000-0000-000000000099 not found',
  'a missing order raises P0002');

-- ---------------------------------------------------------------------------
-- Happy path: stacked order + delivery promos
-- ---------------------------------------------------------------------------

SELECT lives_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000001', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250},
      {"promo_id":"a0000000-0000-0000-0000-000000000002","scope":"delivery","discount_cents":200}
    ]'::jsonb)$$,
  'a valid stacked claim succeeds');
SELECT is(
  (SELECT count(*) FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000001'),
  2::bigint,
  'the stacked claim writes two applications');
SELECT is(
  (SELECT sum(discount_cents) FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000001'),
  450::bigint,
  'the stacked claim writes the exact order discount');
SELECT is(
  (SELECT discount_cents FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000001' AND scope = 'order'),
  250,
  'the order-scope application is 25 percent of the subtotal');
SELECT is(
  (SELECT discount_cents FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000001' AND scope = 'delivery'),
  200,
  'the delivery-scope application is capped at max_discount_cents');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-000000000001'),
  1,
  'the order promo counter moved once');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-000000000002'),
  1,
  'the delivery promo counter moved once');

-- ---------------------------------------------------------------------------
-- Idempotent replay
-- ---------------------------------------------------------------------------

SELECT lives_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000001', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000002","scope":"delivery","discount_cents":200},
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250}
    ]'::jsonb)$$,
  'an exact replay in a different entry order is a no-op');
SELECT is(
  (SELECT count(*) FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000001'),
  2::bigint,
  'an exact replay writes no additional applications');
SELECT is(
  (SELECT sum(current_uses) FROM public.promo_codes
   WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002')),
  2::bigint,
  'an exact replay does not increment the counters again');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000001', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":249},
      {"promo_id":"a0000000-0000-0000-0000-000000000002","scope":"delivery","discount_cents":200}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'a replay with a different discount is rejected');
SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000001', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'a replay with fewer entries is rejected');

-- ---------------------------------------------------------------------------
-- Stale or changed promo configuration
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000002', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000003","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'an expired promo is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000003', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000004","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a not-yet-valid promo is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000004', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000005","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'an inactive promo is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000005', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000006","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'an exhausted promo is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000006', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000007","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a promo below its minimum order is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000007', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000008","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a NULL valid_from is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000008', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000009","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a NULL valid_until is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000009', '[
      {"promo_id":"a0000000-0000-0000-0000-0000000000ff","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a missing promo is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-00000000000a', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"delivery","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a scope mismatch is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-00000000000b', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":300}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a discount that does not match the promo is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-00000000000c', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a sum that does not match the order discount is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-00000000000d', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'an order promo_code_id mismatch is rejected');

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-00000000000e', '[
      {"promo_id":"a0000000-0000-0000-0000-000000000001","scope":"order","discount_cents":250}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE', 'a non-pending order is rejected');

SELECT is(
  (SELECT count(*) FROM public.order_promo_applications
   WHERE order_id IN (
     'b0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000003',
     'b0000000-0000-0000-0000-000000000004','b0000000-0000-0000-0000-000000000005',
     'b0000000-0000-0000-0000-000000000006','b0000000-0000-0000-0000-000000000007',
     'b0000000-0000-0000-0000-000000000008','b0000000-0000-0000-0000-000000000009',
     'b0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b',
     'b0000000-0000-0000-0000-00000000000c','b0000000-0000-0000-0000-00000000000d',
     'b0000000-0000-0000-0000-00000000000e')),
  0::bigint,
  'rejected claims write no applications');
SELECT is(
  (SELECT sum(current_uses) FROM public.promo_codes
   WHERE id IN (
     'a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000004',
     'a0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000006',
     'a0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000008',
     'a0000000-0000-0000-0000-000000000009')),
  1::bigint,
  'rejected claims do not move any counters');

-- ---------------------------------------------------------------------------
-- Overflow-safe capping
-- ---------------------------------------------------------------------------

SELECT lives_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000012', '[
      {"promo_id":"a0000000-0000-0000-0000-00000000000a","scope":"order","discount_cents":1001}
    ]'::jsonb)$$,
  'a huge percentage is capped at the order base without overflowing');
SELECT is(
  (SELECT discount_cents FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000012'),
  1001,
  'the huge percentage application is capped at the subtotal');
SELECT lives_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000013', '[
      {"promo_id":"a0000000-0000-0000-0000-00000000000b","scope":"order","discount_cents":1001}
    ]'::jsonb)$$,
  'a huge fixed discount is capped at the order base');
SELECT is(
  (SELECT discount_cents FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000013'),
  1001,
  'the huge fixed application is capped at the subtotal');

-- ---------------------------------------------------------------------------
-- All-or-nothing rollback
-- ---------------------------------------------------------------------------

SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000011', '[
      {"promo_id":"a0000000-0000-0000-0000-00000000000d","scope":"order","discount_cents":250},
      {"promo_id":"a0000000-0000-0000-0000-00000000000e","scope":"order","discount_cents":100}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'a claim fails when any selected promo is exhausted');
SELECT is(
  (SELECT count(*) FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000011'),
  0::bigint,
  'the failed claim wrote no applications');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-00000000000d'),
  0,
  'the valid promo locked before the failure was rolled back');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-00000000000e'),
  1,
  'the exhausted promo counter is unchanged');

-- ---------------------------------------------------------------------------
-- Cap atomicity
-- ---------------------------------------------------------------------------

SELECT lives_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000014', '[
      {"promo_id":"a0000000-0000-0000-0000-00000000000c","scope":"order","discount_cents":300}
    ]'::jsonb)$$,
  'the first claim on a single-use promo succeeds');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-00000000000c'),
  1,
  'the single-use promo counter is now at its cap');
SELECT throws_ok(
  $$SELECT public.claim_order_promos('b0000000-0000-0000-0000-000000000015', '[
      {"promo_id":"a0000000-0000-0000-0000-00000000000c","scope":"order","discount_cents":300}
    ]'::jsonb)$$,
  'P0001', 'PROMO_UNAVAILABLE',
  'a second claim on the capped promo is rejected');
SELECT is(
  (SELECT count(*) FROM public.order_promo_applications
   WHERE order_id = 'b0000000-0000-0000-0000-000000000015'),
  0::bigint,
  'the rejected second claim wrote no applications');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-00000000000c'),
  1,
  'the rejected second claim did not move the counter');

-- ---------------------------------------------------------------------------
-- increment_promo_code_usage keeps its boolean contract and stays atomic
-- ---------------------------------------------------------------------------

SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-00000000000f', 1),
  true,
  'a positive increment under the cap returns true');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-00000000000f'),
  1,
  'the positive increment moved the counter');
SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-00000000000f', 0),
  false,
  'a zero increment returns false');
SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-00000000000f', -1),
  false,
  'a negative increment returns false');
SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-0000000000ff', 1),
  false,
  'a missing promo returns false');
SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-000000000006', 1),
  false,
  'an exhausted promo returns false');
SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-00000000000f', 100),
  false,
  'an increment that would cross the cap returns false');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-00000000000f'),
  1,
  'a rejected increment leaves the counter unchanged');

SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-000000000010', 1),
  true,
  'the first increment on a two-use promo returns true');
SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-000000000010', 1),
  true,
  'the second increment reaches the cap and returns true');
SELECT is(
  public.increment_promo_code_usage('a0000000-0000-0000-0000-000000000010', 1),
  false,
  'the increment after the cap returns false');
SELECT is(
  (SELECT current_uses FROM public.promo_codes
   WHERE id = 'a0000000-0000-0000-0000-000000000010'),
  2,
  'the capped promo never exceeds max_uses');

SELECT * FROM finish();
ROLLBACK;
