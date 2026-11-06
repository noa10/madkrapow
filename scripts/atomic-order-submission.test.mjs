import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

// Run the same pgTAP probes as the Supabase integration job against an
// in-memory PostgreSQL database when a local Supabase instance is unavailable.
// The schema below is intentionally minimal; the full-schema CI job remains
// authoritative for constraints and other migrations.
const sqlFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const schema = `
  CREATE ROLE anon;
  CREATE ROLE authenticated;
  CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION public.merchant_notification_user_authorized(uuid)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

  CREATE TABLE categories (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE menu_items (
    id uuid PRIMARY KEY, category_id uuid NOT NULL REFERENCES categories(id),
    name text NOT NULL, price_cents integer NOT NULL, image_url text,
    is_available boolean NOT NULL DEFAULT true
  );
  CREATE TABLE modifier_groups (id uuid PRIMARY KEY, name text NOT NULL);
  CREATE TABLE modifiers (
    id uuid PRIMARY KEY, modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id),
    name text NOT NULL, price_delta_cents integer NOT NULL DEFAULT 0,
    is_available boolean NOT NULL DEFAULT true
  );
  CREATE TABLE menu_item_modifier_groups (
    menu_item_id uuid NOT NULL REFERENCES menu_items(id),
    modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id),
    UNIQUE (menu_item_id, modifier_group_id)
  );
  CREATE TABLE restaurant_tables (id uuid PRIMARY KEY, label text NOT NULL, is_active boolean NOT NULL);
  CREATE TABLE customers (id uuid PRIMARY KEY, auth_user_id uuid, name text);
  CREATE TABLE orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text NOT NULL UNIQUE,
    customer_id uuid REFERENCES customers(id), customer_name text, customer_phone text,
    status text NOT NULL, source text NOT NULL DEFAULT 'web', delivery_type text NOT NULL,
    table_id uuid REFERENCES restaurant_tables(id), table_label text, pax integer, payment_method text,
    fulfillment_type text NOT NULL DEFAULT 'asap', order_kind text NOT NULL DEFAULT 'standard',
    dispatch_status text DEFAULT 'not_ready', subtotal_cents integer NOT NULL,
    delivery_fee_cents integer NOT NULL DEFAULT 0, discount_cents integer NOT NULL DEFAULT 0,
    total_cents integer NOT NULL, notes text, include_cutlery boolean DEFAULT true,
    idempotency_key text, display_code text DEFAULT 'MK-001',
    delivery_address_json jsonb, scheduled_for timestamptz, requires_manual_review boolean,
    approval_status text, bulk_company_name text, bulk_requested_date timestamptz,
    bulk_budget_cents integer, bulk_invoice_name text, bulk_contact_phone text,
    bulk_special_notes text, bulk_dropoff_instructions text, kitchen_lead_minutes integer,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX idx_orders_idempotency_key ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
  CREATE TABLE order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
    menu_item_id uuid REFERENCES menu_items(id), menu_item_name text NOT NULL,
    menu_item_price_cents integer NOT NULL, quantity integer NOT NULL,
    line_total_cents integer NOT NULL, notes text, image_url text
  );
  CREATE TABLE order_item_modifiers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_item_id uuid NOT NULL REFERENCES order_items(id),
    modifier_id uuid REFERENCES modifiers(id), modifier_name text NOT NULL,
    modifier_price_delta_cents integer NOT NULL
  );
  CREATE TABLE order_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
    event_type text NOT NULL, actor_id uuid, new_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id));
  CREATE TABLE merchant_notification_owners (user_id uuid PRIMARY KEY);
  CREATE TABLE merchant_notification_config (singleton boolean PRIMARY KEY DEFAULT true, activated_at timestamptz);
  INSERT INTO merchant_notification_config VALUES (true, now());
  CREATE TABLE fcm_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, device_id text, token text,
    platform text, registration_version uuid DEFAULT gen_random_uuid(), created_at timestamptz DEFAULT now()
  );
`

// PGlite does not package pgTAP. These assertion functions execute the same
// checks and throw on failure; the Supabase job runs the file with real pgTAP.
const assertions = `
  CREATE FUNCTION public.plan(integer) RETURNS text LANGUAGE sql AS $$ SELECT '1..' || $1::text $$;
  CREATE FUNCTION public.is(anyelement, anyelement, text) RETURNS text LANGUAGE plpgsql AS $$
  BEGIN
    IF $1 IS DISTINCT FROM $2 THEN
      RAISE EXCEPTION 'assertion failed: % (got %, expected %)', $3, $1, $2;
    END IF;
    RETURN 'ok - ' || $3;
  END;
  $$;
  CREATE FUNCTION public.ok(boolean, text) RETURNS text LANGUAGE plpgsql AS $$
  BEGIN
    IF $1 IS NOT TRUE THEN RAISE EXCEPTION 'assertion failed: %', $2; END IF;
    RETURN 'ok - ' || $2;
  END;
  $$;
  CREATE FUNCTION public.throws_ok(text, text, text, text) RETURNS text LANGUAGE plpgsql AS $$
  DECLARE actual_state text; actual_message text;
  BEGIN
    BEGIN
      EXECUTE $1;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE, actual_message = MESSAGE_TEXT;
    END;
    IF actual_state IS DISTINCT FROM $2 OR actual_message IS DISTINCT FROM $3 THEN
      RAISE EXCEPTION 'assertion failed: % (got %: %, expected %: %)',
        $4, actual_state, actual_message, $2, $3;
    END IF;
    RETURN 'ok - ' || $4;
  END;
  $$;
  CREATE FUNCTION public.finish() RETURNS SETOF text LANGUAGE sql AS $$ SELECT 'finished'::text $$;
`

describe('atomic order submission SQL probes', () => {
  it('runs the real RPCs and notification trigger in embedded PostgreSQL', async () => {
    const db = new PGlite()
    try {
      await db.exec(schema)
      await db.exec(assertions)
      await db.exec(await sqlFile('supabase/migrations/074_pos_counter_dine_in_lock.sql'))
      await db.exec(`CREATE TRIGGER trg_orders_table_order_rate_limit BEFORE INSERT ON orders
        FOR EACH ROW EXECUTE FUNCTION enforce_table_order_rate_limit()`)
      await db.exec(await sqlFile('supabase/migrations/20261105184658_atomic_table_qr_order.sql'))
      await db.exec(await sqlFile('supabase/migrations/20261105184805_atomic_bulk_submission.sql'))
      await db.exec(await sqlFile('supabase/migrations/20261105185040_merchant_notifications_outbox.sql'))
      const results = await db.exec(await sqlFile('supabase/tests/atomic_order_submission.test.sql'))
      const passed = results.flatMap((result) => result.rows).filter((row) =>
        Object.values(row).some((value) => typeof value === 'string' && value.startsWith('ok - ')),
      )
      expect(passed).toHaveLength(44)
    } finally {
      await db.close()
    }
  }, 30_000)
})
