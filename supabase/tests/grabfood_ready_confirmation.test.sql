-- pgTAP probes for confirm_grabfood_order_ready
-- (migration 20261126120000_atomic_grabfood_ready_confirmation.sql).
--
-- The RPC is the transactional replacement for the route's old three-statement
-- claim/order/audit sequence. These probes cover the state machine (paid,
-- preparing, ready), every claim state (none, sent, pending, failed,
-- uncertain), the guard rails, idempotency, privileges, and the atomicity
-- guarantee that an audit failure rolls the order and claim back.

BEGIN;
SELECT plan(69);

-- Fixtures ---------------------------------------------------------------
-- One order per scenario so a failed assertion cannot be masked by another
-- scenario's row.
INSERT INTO orders (id, order_number, status, source, delivery_type, subtotal_cents, total_cents) VALUES
  ('81000000-0000-4000-8000-000000000001', 'GRAB-CONFIRM-PAID',           'paid',      'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-000000000002', 'GRAB-CONFIRM-PREP',           'preparing', 'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-000000000003', 'GRAB-CONFIRM-READY',          'ready',     'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-000000000004', 'GRAB-CONFIRM-FAILED',         'preparing', 'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-000000000005', 'GRAB-CONFIRM-UNCERTAIN',      'paid',      'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-000000000006', 'GRAB-CONFIRM-SENT',           'preparing', 'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-000000000007', 'GRAB-CONFIRM-PENDING-CLAIM',  'preparing', 'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-000000000008', 'GRAB-CONFIRM-PENDING-ORDER',  'pending',   'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-000000000009', 'GRAB-CONFIRM-WEB',            'preparing', 'web',      'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-00000000000a', 'GRAB-CONFIRM-ACCEPTED',       'accepted',  'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-00000000000b', 'GRAB-CONFIRM-CANCELLED',      'cancelled', 'grabfood', 'delivery', 1000, 1000),
  ('81000000-0000-4000-8000-00000000000c', 'GRAB-CONFIRM-AUDIT-FAIL',     'paid',      'grabfood', 'delivery', 1000, 1000);

INSERT INTO grabfood_ready_claims (order_id, state, claim_token, updated_at) VALUES
  ('81000000-0000-4000-8000-000000000004', 'failed',    '84000000-0000-4000-8000-000000000004', now() - interval '5 minutes'),
  ('81000000-0000-4000-8000-000000000005', 'uncertain', '84000000-0000-4000-8000-000000000005', now() - interval '5 minutes'),
  ('81000000-0000-4000-8000-000000000006', 'sent',      '84000000-0000-4000-8000-000000000006', now() - interval '5 minutes'),
  ('81000000-0000-4000-8000-000000000007', 'pending',   '84000000-0000-4000-8000-000000000007', now());

-- A paid order is the normal case: it becomes ready, the claim is sent, and
-- one audit row records the old status, the new status, the reason and token.
CREATE TEMP TABLE confirm_paid AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000001'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_paid), 'true',
  'paid order confirms');                                                   -- 1
SELECT is((SELECT r ->> 'changed' FROM confirm_paid), 'true',
  'paid order changes status');                                             -- 2
SELECT is((SELECT r ->> 'duplicate' FROM confirm_paid), 'false',
  'first confirmation is not a duplicate');                                 -- 3
SELECT is((SELECT r ->> 'previous_status' FROM confirm_paid), 'paid',
  'previous status is reported');                                           -- 4
SELECT is((SELECT status FROM orders WHERE id = '81000000-0000-4000-8000-000000000001'), 'ready',
  'paid order is ready');                                                   -- 5
SELECT is((SELECT state FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000001'), 'sent',
  'paid order claim is sent');                                              -- 6
SELECT is(
  (SELECT claim_token::text FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000001'),
  (SELECT r ->> 'claim_token' FROM confirm_paid),
  'claim token matches the result');                                        -- 7
SELECT is(
  (SELECT count(*) FROM order_events WHERE order_id = '81000000-0000-4000-8000-000000000001'),
  1::bigint,
  'paid order has exactly one audit row');                                  -- 8
SELECT ok(EXISTS (
  SELECT 1
  FROM order_events
  WHERE order_id = '81000000-0000-4000-8000-000000000001'
    AND event_type = 'status_changed'
    AND old_value = '{"status":"paid"}'::jsonb
    AND new_value ->> 'status' = 'ready'
    AND new_value ->> 'reason' = 'already_marked_ready_in_grab'
    AND new_value ->> 'claim_token' = (SELECT r ->> 'claim_token' FROM confirm_paid)
    AND new_value ->> 'previous_claim_state' IS NULL
    AND actor_id = '83000000-0000-4000-8000-000000000001'
), 'paid order audit row is accurate');                                     -- 9

-- A preparing order is the other forward kitchen transition.
CREATE TEMP TABLE confirm_prep AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000002'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_prep), 'true',
  'preparing order confirms');                                              -- 10
SELECT is((SELECT status FROM orders WHERE id = '81000000-0000-4000-8000-000000000002'), 'ready',
  'preparing order is ready');                                              -- 11
SELECT is((SELECT state FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000002'), 'sent',
  'preparing order claim is sent');                                         -- 12
SELECT ok(EXISTS (
  SELECT 1 FROM order_events
  WHERE order_id = '81000000-0000-4000-8000-000000000002'
    AND old_value = '{"status":"preparing"}'::jsonb
    AND new_value ->> 'status' = 'ready'
), 'preparing order audit records the old status');                         -- 13

-- Already ready with no claim: this is a legacy/edge confirmation. It must
-- create the durable claim but must not invent a ready -> ready event.
CREATE TEMP TABLE confirm_ready AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000003'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_ready), 'true',
  'ready order confirms');                                                  -- 14
SELECT is((SELECT r ->> 'changed' FROM confirm_ready), 'false',
  'ready order reports no change');                                         -- 15
SELECT is((SELECT r ->> 'duplicate' FROM confirm_ready), 'false',
  'first confirmation of a ready order is not a duplicate');                -- 16
SELECT is((SELECT state FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000003'), 'sent',
  'ready order gets a sent claim');                                         -- 17
SELECT is(
  (SELECT claim_token::text FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000003'),
  (SELECT r ->> 'claim_token' FROM confirm_ready),
  'ready order claim token matches the result');                            -- 18
SELECT is(
  (SELECT count(*) FROM order_events WHERE order_id = '81000000-0000-4000-8000-000000000003'),
  0::bigint,
  'ready order gets no status event');                                      -- 19

-- Repeating the same confirmation is idempotent: no second event, no new
-- token, and duplicate = true.
CREATE TEMP TABLE confirm_dup AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000001'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_dup), 'true',
  'duplicate confirmation succeeds');                                       -- 20
SELECT is((SELECT r ->> 'changed' FROM confirm_dup), 'false',
  'duplicate confirmation changes nothing');                                -- 21
SELECT is((SELECT r ->> 'duplicate' FROM confirm_dup), 'true',
  'duplicate confirmation is reported as duplicate');                       -- 22
SELECT is(
  (SELECT claim_token::text FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000001'),
  (SELECT r ->> 'claim_token' FROM confirm_paid),
  'duplicate confirmation keeps the original token');                       -- 23
SELECT is(
  (SELECT count(*) FROM order_events WHERE order_id = '81000000-0000-4000-8000-000000000001'),
  1::bigint,
  'duplicate confirmation writes no second event');                         -- 24

-- A failed claim is promoted to sent under a fresh token because the manager
-- has checked Grab. The audit must name the new token.
CREATE TEMP TABLE confirm_failed AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000004'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_failed), 'true',
  'failed claim confirms');                                                 -- 25
SELECT is((SELECT r ->> 'changed' FROM confirm_failed), 'true',
  'failed claim changes the order');                                        -- 26
SELECT is((SELECT state FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000004'), 'sent',
  'failed claim is promoted to sent');                                      -- 27
SELECT isnt(
  (SELECT claim_token::text FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000004'),
  '84000000-0000-4000-8000-000000000004',
  'failed claim gets a fresh token');                                       -- 28
SELECT is(
  (SELECT claim_token::text FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000004'),
  (SELECT r ->> 'claim_token' FROM confirm_failed),
  'failed claim token matches the result');                                 -- 29
SELECT is(
  (SELECT new_value ->> 'claim_token' FROM order_events
   WHERE order_id = '81000000-0000-4000-8000-000000000004'),
  (SELECT r ->> 'claim_token' FROM confirm_failed),
  'failed claim audit names the new token');                                -- 30

-- An uncertain claim is promoted the same way.
CREATE TEMP TABLE confirm_uncertain AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000005'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_uncertain), 'true',
  'uncertain claim confirms');                                              -- 31
SELECT is((SELECT r ->> 'changed' FROM confirm_uncertain), 'true',
  'uncertain claim changes the order');                                     -- 32
SELECT is((SELECT state FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000005'), 'sent',
  'uncertain claim is promoted to sent');                                   -- 33
SELECT isnt(
  (SELECT claim_token::text FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000005'),
  '84000000-0000-4000-8000-000000000005',
  'uncertain claim gets a fresh token');                                    -- 34
SELECT is(
  (SELECT new_value ->> 'claim_token' FROM order_events
   WHERE order_id = '81000000-0000-4000-8000-000000000005'),
  (SELECT r ->> 'claim_token' FROM confirm_uncertain),
  'uncertain claim audit names the new token');                             -- 35

-- A sent claim whose order is still preparing is a recovery case: keep the
-- existing token (Grab was already told) but finish the local transition.
CREATE TEMP TABLE confirm_sent AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000006'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_sent), 'true',
  'sent claim recovers');                                                   -- 36
SELECT is((SELECT r ->> 'changed' FROM confirm_sent), 'true',
  'sent claim recovery changes the order');                                 -- 37
SELECT is((SELECT r ->> 'duplicate' FROM confirm_sent), 'false',
  'sent claim recovery is not a duplicate');                                -- 38
SELECT is(
  (SELECT claim_token::text FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000006'),
  '84000000-0000-4000-8000-000000000006',
  'sent claim token is preserved');                                         -- 39
SELECT is(
  (SELECT new_value ->> 'claim_token' FROM order_events
   WHERE order_id = '81000000-0000-4000-8000-000000000006'),
  '84000000-0000-4000-8000-000000000006',
  'sent claim audit uses the preserved token');                             -- 40

-- A pending claim may still be talking to Grab. Never take it over.
CREATE TEMP TABLE confirm_pending_claim AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000007'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_pending_claim), 'false',
  'pending claim is refused');                                              -- 41
SELECT is((SELECT r ->> 'code' FROM confirm_pending_claim), 'in_progress',
  'pending claim returns in_progress');                                     -- 42
SELECT is((SELECT status FROM orders WHERE id = '81000000-0000-4000-8000-000000000007'), 'preparing',
  'pending claim leaves the order preparing');                              -- 43
SELECT is((SELECT state FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000007'), 'pending',
  'pending claim stays pending');                                           -- 44
SELECT is(
  (SELECT claim_token::text FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000007'),
  '84000000-0000-4000-8000-000000000007',
  'pending claim token is untouched');                                      -- 45
SELECT is(
  (SELECT count(*) FROM order_events WHERE order_id = '81000000-0000-4000-8000-000000000007'),
  0::bigint,
  'pending claim writes no audit row');                                     -- 46

-- An unpaid order is refused and gets no claim.
CREATE TEMP TABLE confirm_pending_order AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000008'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_pending_order), 'false',
  'pending order is refused');                                              -- 47
SELECT is((SELECT r ->> 'code' FROM confirm_pending_order), 'pending',
  'pending order returns pending');                                         -- 48
SELECT is(
  (SELECT count(*) FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000008'),
  0::bigint,
  'pending order gets no claim');                                           -- 49

-- Only GrabFood orders are eligible.
CREATE TEMP TABLE confirm_web AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000009'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_web), 'false',
  'web order is refused');                                                  -- 50
SELECT is((SELECT r ->> 'code' FROM confirm_web), 'not_grabfood',
  'web order returns not_grabfood');                                        -- 51
SELECT is(
  (SELECT count(*) FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-000000000009'),
  0::bigint,
  'web order gets no claim');                                               -- 52

-- Unknown order.
CREATE TEMP TABLE confirm_missing AS
SELECT confirm_grabfood_order_ready(
  '81999999-9999-4999-8999-999999999999'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_missing), 'false',
  'missing order is refused');                                              -- 53
SELECT is((SELECT r ->> 'code' FROM confirm_missing), 'not_found',
  'missing order returns not_found');                                       -- 54

-- A null actor cannot be audited.
CREATE TEMP TABLE confirm_no_actor AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-000000000001'::uuid,
  NULL
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_no_actor), 'false',
  'null actor is refused');                                                 -- 55
SELECT is((SELECT r ->> 'code' FROM confirm_no_actor), 'actor_required',
  'null actor returns actor_required');                                     -- 56

-- Accepted is not a forward kitchen state.
CREATE TEMP TABLE confirm_accepted AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-00000000000a'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_accepted), 'false',
  'accepted order is refused');                                             -- 57
SELECT is((SELECT r ->> 'code' FROM confirm_accepted), 'not_eligible',
  'accepted order returns not_eligible');                                   -- 58
SELECT is((SELECT r ->> 'current_status' FROM confirm_accepted), 'accepted',
  'accepted order reports its status');                                     -- 59

-- Cancelled is terminal.
CREATE TEMP TABLE confirm_cancelled AS
SELECT confirm_grabfood_order_ready(
  '81000000-0000-4000-8000-00000000000b'::uuid,
  '83000000-0000-4000-8000-000000000001'::uuid
) AS r;

SELECT is((SELECT r ->> 'ok' FROM confirm_cancelled), 'false',
  'cancelled order is refused');                                            -- 60
SELECT is((SELECT r ->> 'code' FROM confirm_cancelled), 'not_eligible',
  'cancelled order returns not_eligible');                                  -- 61
SELECT is(
  (SELECT count(*) FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-00000000000b'),
  0::bigint,
  'cancelled order gets no claim');                                         -- 62

-- The RPC is service_role only; the route's admin/manager check is the
-- application-level gate, not a grant to anon/authenticated.
SELECT ok(
  NOT has_function_privilege('anon', 'public.confirm_grabfood_order_ready(uuid,uuid)', 'EXECUTE'),
  'anonymous users cannot call the confirmation RPC');                      -- 63
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.confirm_grabfood_order_ready(uuid,uuid)', 'EXECUTE'),
  'authenticated users cannot call the confirmation RPC');                  -- 64
SELECT ok(
  has_function_privilege('service_role', 'public.confirm_grabfood_order_ready(uuid,uuid)', 'EXECUTE'),
  'service role can call the confirmation RPC');                            -- 65

-- Atomicity: force the audit insert to fail and prove the order status and
-- claim were rolled back with it. throws_ok runs the statement in a
-- subtransaction, so the outer test transaction survives.
CREATE OR REPLACE FUNCTION public.fail_grab_confirm_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit unavailable';
  RETURN NEW;
END;
$$;

CREATE TRIGGER fail_grab_confirm_audit
BEFORE INSERT ON order_events
FOR EACH ROW EXECUTE FUNCTION public.fail_grab_confirm_audit();

SELECT throws_ok(
  $$SELECT confirm_grabfood_order_ready(
      '81000000-0000-4000-8000-00000000000c'::uuid,
      '83000000-0000-4000-8000-000000000001'::uuid
    )$$,
  'P0001',
  'audit unavailable',
  'an audit failure aborts the whole confirmation');                         -- 66

DROP TRIGGER fail_grab_confirm_audit ON order_events;
DROP FUNCTION public.fail_grab_confirm_audit();

SELECT is((SELECT status FROM orders WHERE id = '81000000-0000-4000-8000-00000000000c'), 'paid',
  'order status rolls back when audit fails');                              -- 67
SELECT is(
  (SELECT count(*) FROM grabfood_ready_claims WHERE order_id = '81000000-0000-4000-8000-00000000000c'),
  0::bigint,
  'claim rolls back when audit fails');                                     -- 68
SELECT is(
  (SELECT count(*) FROM order_events WHERE order_id = '81000000-0000-4000-8000-00000000000c'),
  0::bigint,
  'audit row is not left behind when audit fails');                         -- 69

SELECT * FROM finish();
ROLLBACK;
