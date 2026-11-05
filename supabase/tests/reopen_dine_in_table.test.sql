-- pgTAP probes for reopen_dine_in_table (migration 20261105195200).
--
-- Reopen is the inverse of close_dine_in_table (062): today's closed dine-in
-- tickets go picked_up -> ready, re-occupying the table, and table_events gets
-- an audit row. "Today" is the Asia/Kuala_Lumpur calendar day.

BEGIN;
SELECT plan(16);

-- Fixtures ---------------------------------------------------------------
INSERT INTO restaurant_tables (id, label) VALUES
  ('71000000-0000-4000-8000-000000000001', 'reopen T1'),
  ('71000000-0000-4000-8000-000000000002', 'reopen T2'),
  ('71000000-0000-4000-8000-000000000003', 'reopen T3'),
  ('71000000-0000-4000-8000-000000000004', 'reopen T4'),
  ('71000000-0000-4000-8000-000000000005', 'reopen T5');

INSERT INTO orders (id, order_number, status, source, delivery_type, table_id, subtotal_cents, total_cents) VALUES
  ('72000000-0000-4000-8000-000000000001', 'REOPEN-1', 'ready', 'counter', 'dine_in', '71000000-0000-4000-8000-000000000001', 1000, 1000),
  ('72000000-0000-4000-8000-000000000003', 'REOPEN-3', 'picked_up', 'counter', 'dine_in', '71000000-0000-4000-8000-000000000003', 1000, 1000),
  ('72000000-0000-4000-8000-00000000004a', 'REOPEN-4-CLOSED', 'picked_up', 'counter', 'dine_in', '71000000-0000-4000-8000-000000000004', 1000, 1000),
  ('72000000-0000-4000-8000-00000000004b', 'REOPEN-4-NEW', 'pending', 'counter', 'dine_in', '71000000-0000-4000-8000-000000000004', 500, 500),
  ('72000000-0000-4000-8000-00000000005a', 'REOPEN-5-DINE', 'picked_up', 'counter', 'dine_in', '71000000-0000-4000-8000-000000000005', 1000, 1000),
  ('72000000-0000-4000-8000-00000000005b', 'REOPEN-5-DELIVERY', 'picked_up', 'counter', 'delivery', '71000000-0000-4000-8000-000000000005', 1000, 1000);

-- T3: closed yesterday (KL). T4: closed today, and a new party is already on
-- the table. T5: one close-reason dine-in ticket plus a delivery ticket that
-- merely shares the table_id and must never be touched.
INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id, created_at)
SELECT '72000000-0000-4000-8000-000000000003'::uuid, 'status_changed',
       '{"status":"ready"}'::jsonb,
       '{"status":"picked_up","reason":"table_closed","from":"ready"}'::jsonb,
       NULL,
       (((NOW() AT TIME ZONE 'Asia/Kuala_Lumpur')::date - 1) + time '00:05')
         AT TIME ZONE 'Asia/Kuala_Lumpur';

INSERT INTO order_events (order_id, event_type, old_value, new_value, actor_id)
VALUES
  ('72000000-0000-4000-8000-00000000004a', 'status_changed',
   '{"status":"ready"}'::jsonb,
   '{"status":"picked_up","reason":"table_closed","from":"ready"}'::jsonb, NULL),
  ('72000000-0000-4000-8000-00000000005a', 'status_changed',
   '{"status":"ready"}'::jsonb,
   '{"status":"picked_up","reason":"table_closed","from":"ready"}'::jsonb, NULL),
  ('72000000-0000-4000-8000-00000000005b', 'status_changed',
   '{"status":"preparing"}'::jsonb,
   '{"status":"picked_up","reason":"lalamove_picked_up"}'::jsonb, NULL);

-- Close -> reopen round trip --------------------------------------------
CREATE TEMP TABLE close_one AS
SELECT close_dine_in_table(
  '71000000-0000-4000-8000-000000000001'::uuid,
  '73000000-0000-4000-8000-000000000001'::uuid,
  ARRAY['72000000-0000-4000-8000-000000000001']::uuid[]
) AS r;

SELECT is((SELECT r ->> 'ok' FROM close_one), 'true',
  'close completes the fixture round');
SELECT is((SELECT r ->> 'closed' FROM close_one), '1',
  'close reports one completed ticket');
SELECT is((SELECT status FROM orders WHERE order_number = 'REOPEN-1'), 'picked_up',
  'closed ticket is picked_up before reopen');

CREATE TEMP TABLE reopen_one AS
SELECT reopen_dine_in_table(
  '71000000-0000-4000-8000-000000000001'::uuid,
  '73000000-0000-4000-8000-000000000001'::uuid,
  'customer still at the table'
) AS r;

SELECT is((SELECT r ->> 'ok' FROM reopen_one), 'true',
  'reopen succeeds on the same KL day');
SELECT is((SELECT r ->> 'reopened' FROM reopen_one), '1',
  'reopen reports one restored ticket');
SELECT is((SELECT status FROM orders WHERE order_number = 'REOPEN-1'), 'ready',
  'reopened ticket is ready again');
SELECT ok(EXISTS (
  SELECT 1 FROM order_events
  WHERE order_id = '72000000-0000-4000-8000-000000000001'
    AND event_type = 'status_changed'
    AND new_value ->> 'status' = 'ready'
    AND new_value ->> 'reason' = 'table_reopened'
), 'reopen writes a status_changed event with the audit reason');
SELECT ok(EXISTS (
  SELECT 1 FROM table_events
  WHERE table_id = '71000000-0000-4000-8000-000000000001'
    AND event_type = 'reopened'
    AND actor_id = '73000000-0000-4000-8000-000000000001'
    AND details ->> 'reason' = 'customer still at the table'
), 'reopen writes a table_events audit row with actor and reason');

-- Guards ----------------------------------------------------------------
SELECT is((reopen_dine_in_table(
    '71000000-0000-4000-8000-000000000002'::uuid,
    '73000000-0000-4000-8000-000000000001'::uuid,
    'nothing here')) ->> 'code', 'not_closed',
  'a table with no closed tickets is refused');

SELECT is((reopen_dine_in_table(
    '71000000-0000-4000-8000-000000000003'::uuid,
    '73000000-0000-4000-8000-000000000001'::uuid,
    'yesterday')) ->> 'code', 'not_closed',
  'a close from yesterday (KL) cannot be reopened');

SELECT is((reopen_dine_in_table(
    '71000000-0000-4000-8000-000000000004'::uuid,
    '73000000-0000-4000-8000-000000000001'::uuid,
    'new party')) ->> 'code', 'occupied',
  'a table with new open orders is refused');

-- Only dine-in close-reason tickets are restored ------------------------
CREATE TEMP TABLE reopen_five AS
SELECT reopen_dine_in_table(
  '71000000-0000-4000-8000-000000000005'::uuid,
  '73000000-0000-4000-8000-000000000001'::uuid,
  'mixed table'
) AS r;

SELECT is((SELECT r ->> 'ok' FROM reopen_five), 'true',
  'dine-in close-reason tickets are reopened');
SELECT is((SELECT r ->> 'reopened' FROM reopen_five), '1',
  'only the dine-in ticket is restored');
SELECT is((SELECT status FROM orders WHERE order_number = 'REOPEN-5-DELIVERY'),
  'picked_up', 'a picked_up delivery ticket sharing the table is untouched');

SELECT is((reopen_dine_in_table(
    '71000000-0000-4000-8000-000000000001'::uuid,
    '73000000-0000-4000-8000-000000000001'::uuid,
    '   ')) ->> 'code', 'reason_required',
  'a blank reason is refused');

SELECT is((reopen_dine_in_table(
    '79999999-9999-4999-8999-999999999999'::uuid,
    '73000000-0000-4000-8000-000000000001'::uuid,
    'missing')) ->> 'code', 'not_found',
  'an unknown table is refused');

SELECT * FROM finish();
ROLLBACK;
