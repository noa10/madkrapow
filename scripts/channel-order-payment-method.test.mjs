import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

// Run the same pgTAP RPC probes with real PostgreSQL functions in memory.
// Full-schema pgTAP remains authoritative for constraints and triggers.
const sql = (path) => readFile(new URL(`../supabase/${path}`, import.meta.url), 'utf8')
const migrations = [
  'migrations/20261126063105_channel_order_payment_method.sql',
  'migrations/20261126063225_channel_order_payment_method_definition_correction.sql',
]
const baseline = process.env.CHANNEL_SNAPSHOT_BASELINE === '1'
const schema = `
  CREATE ROLE anon;
  CREATE ROLE service_role;
  CREATE TABLE integration_events(id uuid primary key, provider text, event_type text, status text, attempts int, locked_until timestamptz, error text, processed_at timestamptz, payload jsonb);
  CREATE TABLE orders(id uuid primary key default gen_random_uuid(), order_number text unique, status text, source text, delivery_type text, fulfillment_type text, scheduled_for timestamptz, subtotal_cents int, discount_cents int, delivery_fee_cents int, total_cents int, customer_id uuid, customer_name text, notes text, include_cutlery boolean, payment_method text, updated_at timestamptz);
  CREATE TABLE order_items(order_id uuid, menu_item_id uuid, menu_item_name text, menu_item_price_cents int, quantity int, line_total_cents int, notes text);
  CREATE TABLE payments(id uuid primary key default gen_random_uuid(), order_id uuid, method text, amount_cents int, status text CONSTRAINT payments_status_check CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')), external_ref text, paid_at timestamptz, raw jsonb, created_at timestamptz default now(), updated_at timestamptz);
  CREATE TABLE channel_orders(id uuid primary key default gen_random_uuid(), order_id uuid, channel text, external_order_id text, external_order_number text, external_store_id text, external_status text, raw_payload jsonb, updated_at timestamptz, CONSTRAINT channel_orders_channel_external_unique UNIQUE(channel, external_order_id));
  CREATE TABLE order_events(order_id uuid, event_type text, new_value jsonb);
  CREATE FUNCTION public.plan(integer) RETURNS text LANGUAGE sql AS $$ SELECT '1..' || $1::text $$;
  CREATE FUNCTION public.is(anyelement, anyelement, text) RETURNS text LANGUAGE plpgsql AS $$
  BEGIN
    IF $1 IS DISTINCT FROM $2 THEN RAISE EXCEPTION 'assertion failed: % (got %, expected %)', $3, $1, $2; END IF;
    RETURN 'ok - ' || $3;
  END; $$;
  CREATE FUNCTION public.throws_ok(text, character, text, text) RETURNS text LANGUAGE plpgsql AS $$
  DECLARE caught_state text; caught_message text;
  BEGIN
    BEGIN
      EXECUTE $1;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS caught_state = RETURNED_SQLSTATE, caught_message = MESSAGE_TEXT;
    END;
    IF caught_state IS DISTINCT FROM $2::text OR caught_message IS DISTINCT FROM $3 THEN
      RAISE EXCEPTION 'assertion failed: % (got %: %)', $4, caught_state, caught_message;
    END IF;
    RETURN 'ok - ' || $4;
  END; $$;
  CREATE FUNCTION public.finish() RETURNS SETOF text LANGUAGE sql AS $$ SELECT 'finished'::text $$;
`

async function setup() {
  const db = new PGlite()
  await db.exec(schema)
  await db.exec(await sql('migrations/052_channel_order_rpc.sql'))
  await db.exec(await sql('migrations/070_grabfood_fix_order_event_lease.sql'))
  await db.exec(`
    REVOKE ALL ON FUNCTION import_channel_order(jsonb), apply_channel_order(jsonb) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION import_channel_order(jsonb), apply_channel_order(jsonb) TO service_role;
  `)
  return db
}

describe('channel order payment snapshots', () => {
  it('runs pgTAP probes through both actual RPCs', async () => {
    const db = await setup()
    try {
      if (!baseline) {
        for (const migration of migrations) await db.exec(await sql(migration))
      }
      const results = await db.exec(await sql('tests/channel_order_payment_method.test.sql'))
      const passed = results.flatMap((result) => result.rows).filter((row) =>
        Object.values(row).some((value) => typeof value === 'string' && value.startsWith('ok - ')),
      )
      expect(passed).toHaveLength(30)
    } finally {
      await db.close()
    }
  }, 30_000)

  it('repairs the historical function only when its definition is expected', async () => {
    const db = await setup()
    try {
      const hash = async () => (await db.query(`SELECT md5(prosrc) AS hash FROM pg_proc
        WHERE oid = 'public.apply_channel_order(jsonb)'::regprocedure`)).rows[0].hash
      const correction = await sql(migrations[1])
      await db.exec(await sql(migrations[0]))
      expect(await hash()).toBe('6d4e6394bc08678ad2a4b863e3d2afa6')
      await db.exec(correction)
      expect(await hash()).toBe('97ac1657edc9404a5ccd9a2e24843754')
      await db.exec(correction)
      expect(await hash()).toBe('97ac1657edc9404a5ccd9a2e24843754')
      await db.exec(`DO $alter$
        BEGIN
          EXECUTE replace(
            pg_get_functiondef('public.apply_channel_order(jsonb)'::regprocedure),
            'delivery_fee_cents = COALESCE((v_order ->> ''delivery_fee_cents'')::integer, 0),',
            'delivery_fee_cents = COALESCE((v_order ->> ''delivery_fee_cents'')::integer, 1),'
          );
        END;
      $alter$;`)
      const unexpectedHash = await hash()
      expect(unexpectedHash).not.toBe('97ac1657edc9404a5ccd9a2e24843754')
      await expect(db.exec(correction)).rejects.toThrow('Unexpected apply_channel_order definition:')
      expect(await hash()).toBe(unexpectedHash)
    } finally {
      await db.close()
    }
  }, 30_000)

  // These deliberately synthetic grants test preservation, not production ACLs.
  it('preserves synthetic RPC execution privileges and security attributes', async () => {
    const db = await setup()
    try {
      const properties = `SELECT proname, prosecdef, proconfig, proacl::text FROM pg_proc
        WHERE oid IN ('public.import_channel_order(jsonb)'::regprocedure, 'public.apply_channel_order(jsonb)'::regprocedure)
        ORDER BY proname`
      const before = (await db.query(properties)).rows
      for (const migration of migrations) await db.exec(await sql(migration))
      expect((await db.query(properties)).rows).toEqual(before)
      expect((await db.query(`SELECT has_function_privilege('anon', 'public.import_channel_order(jsonb)', 'EXECUTE') AS anon_import,
        has_function_privilege('service_role', 'public.import_channel_order(jsonb)', 'EXECUTE') AS service_import,
        has_function_privilege('anon', 'public.apply_channel_order(jsonb)', 'EXECUTE') AS anon_apply,
        has_function_privilege('service_role', 'public.apply_channel_order(jsonb)', 'EXECUTE') AS service_apply`)).rows[0]).toEqual({
        anon_import: false, service_import: true, anon_apply: false, service_apply: true,
      })
    } finally {
      await db.close()
    }
  }, 30_000)

  it('backfills only missing platform snapshots using the preferred ledger row', async () => {
    const db = await setup()
    try {
      await db.exec(`
        INSERT INTO orders(id, order_number, source, payment_method, total_cents) VALUES
          ('f1000000-0000-4000-8000-000000000001', 'BACKFILL-1', 'grabfood', NULL, 101),
          ('f1000000-0000-4000-8000-000000000002', 'BACKFILL-2', 'grabfood', NULL, 102),
          ('f1000000-0000-4000-8000-000000000003', 'BACKFILL-3', 'grabfood', 'stripe', 103),
          ('f1000000-0000-4000-8000-000000000004', 'BACKFILL-4', 'web', NULL, 104),
          ('f1000000-0000-4000-8000-000000000005', 'BACKFILL-5', 'grabfood', NULL, 105),
          ('f1000000-0000-4000-8000-000000000006', 'BACKFILL-6', 'foodpanda', NULL, 106);
        INSERT INTO channel_orders(order_id,channel,external_order_id) VALUES
          ('f1000000-0000-4000-8000-000000000001', 'grabfood', 'backfill-1'),
          ('f1000000-0000-4000-8000-000000000002', 'grabfood', 'backfill-2'),
          ('f1000000-0000-4000-8000-000000000003', 'grabfood', 'backfill-3'),
          ('f1000000-0000-4000-8000-000000000005', 'grabfood', 'backfill-5'),
          ('f1000000-0000-4000-8000-000000000006', 'foodpanda', 'backfill-6');
        INSERT INTO payments(order_id,method,status,amount_cents,created_at) VALUES
          ('f1000000-0000-4000-8000-000000000001', 'grabfood', 'succeeded', 101, '2020-01-01'),
          ('f1000000-0000-4000-8000-000000000001', 'cash', 'pending', 101, '2021-01-01'),
          ('f1000000-0000-4000-8000-000000000002', 'grabfood', 'pending', 102, '2020-01-01'),
          ('f1000000-0000-4000-8000-000000000002', 'cash', 'pending', 102, '2021-01-01'),
          ('f1000000-0000-4000-8000-000000000003', 'cash', 'succeeded', 103, '2020-01-01'),
          ('f1000000-0000-4000-8000-000000000004', 'cash', 'succeeded', 104, '2020-01-01');
        INSERT INTO payments(id,order_id,method,status,amount_cents,created_at) VALUES
          ('a1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000006', 'cash', 'pending', 106, '2021-01-01'),
          ('a1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000006', 'foodpanda', 'pending', 106, '2021-01-01');
      `)
      if (!baseline) {
        for (const migration of migrations) await db.exec(await sql(migration))
      }
      const { rows } = await db.query('SELECT order_number, payment_method, total_cents FROM orders ORDER BY order_number')
      expect(rows).toEqual([
        { order_number: 'BACKFILL-1', payment_method: 'grabfood', total_cents: 101 },
        { order_number: 'BACKFILL-2', payment_method: 'cash', total_cents: 102 },
        { order_number: 'BACKFILL-3', payment_method: 'stripe', total_cents: 103 },
        { order_number: 'BACKFILL-4', payment_method: null, total_cents: 104 },
        { order_number: 'BACKFILL-5', payment_method: null, total_cents: 105 },
        { order_number: 'BACKFILL-6', payment_method: 'foodpanda', total_cents: 106 },
      ])
      expect((await db.query('SELECT count(*)::int AS n FROM payments')).rows[0].n).toBe(8)
    } finally {
      await db.close()
    }
  }, 30_000)
})
