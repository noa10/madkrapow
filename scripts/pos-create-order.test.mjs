import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

// An in-memory PostgreSQL database: this test never connects to the POS DB.
// It loads the real migration so the PL/pgSQL function body is exercised, not
// a mock of it.
let db

const ACTOR = '99999999-9999-4999-8999-999999999999'
const TABLE_ID = '11111111-1111-4111-8111-111111111111'
const INACTIVE_TABLE_ID = '11111111-1111-4111-8111-111111111112'
const MENU_ID = '22222222-2222-4222-8222-222222222222'
const REQUIRED_MENU_ID = '22222222-2222-4222-8222-222222222223'
const SOLD_OUT_MENU_ID = '22222222-2222-4222-8222-222222222224'
const GROUP_ID = '33333333-3333-4333-8333-333333333333'
const REQUIRED_GROUP_ID = '33333333-3333-4333-8333-333333333334'
const MODIFIER_ID = '44444444-4444-4444-8444-444444444444'
const REQUIRED_MODIFIER_ID = '44444444-4444-4444-8444-444444444445'
const OTHER_MODIFIER_ID = '44444444-4444-4444-8444-444444444446'

const order = (overrides = {}) => ({
  order_number: 'MK-TEST-1',
  order_type: 'dine_in',
  table_id: TABLE_ID,
  pax: 2,
  payment_method: 'cash',
  customer_name: 'Aina',
  notes: 'less spicy',
  ...overrides,
})

const items = (overrides = []) => [
  {
    menu_item_id: MENU_ID,
    quantity: 2,
    modifier_ids: [MODIFIER_ID],
    notes: 'less rice',
    ...overrides[0],
  },
]

const createOrder = (orderBody = order(), itemBody = items()) =>
  db.query('SELECT public.create_pos_order($1, $2::jsonb, $3::jsonb) AS result', [
    ACTOR,
    JSON.stringify(orderBody),
    JSON.stringify(itemBody),
  ])

const counts = async () => {
  const { rows } = await db.query(`
    SELECT
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM order_items) AS items,
      (SELECT count(*)::int FROM order_item_modifiers) AS modifiers,
      (SELECT count(*)::int FROM payments) AS payments,
      (SELECT count(*)::int FROM order_events) AS events
  `)
  return rows[0]
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;

    CREATE TABLE restaurant_tables (
      id uuid PRIMARY KEY,
      label text NOT NULL,
      is_active boolean NOT NULL DEFAULT true
    );
    CREATE TABLE menu_items (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      price_cents integer NOT NULL,
      is_available boolean NOT NULL DEFAULT true
    );
    CREATE TABLE modifier_groups (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      min_selections integer NOT NULL DEFAULT 0,
      max_selections integer NOT NULL DEFAULT 1
    );
    CREATE TABLE modifiers (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      price_delta_cents integer NOT NULL DEFAULT 0,
      modifier_group_id uuid NOT NULL,
      is_available boolean NOT NULL DEFAULT true
    );
    CREATE TABLE menu_item_modifier_groups (
      menu_item_id uuid NOT NULL,
      modifier_group_id uuid NOT NULL,
      is_required boolean NOT NULL DEFAULT false,
      PRIMARY KEY (menu_item_id, modifier_group_id)
    );
    CREATE TABLE orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_number text NOT NULL UNIQUE,
      customer_id uuid,
      customer_name text,
      status text NOT NULL,
      source text NOT NULL,
      delivery_type text NOT NULL,
      table_id uuid,
      table_label text,
      pax integer,
      payment_method text,
      fulfillment_type text NOT NULL DEFAULT 'asap',
      order_kind text NOT NULL DEFAULT 'standard',
      dispatch_status text NOT NULL DEFAULT 'not_ready',
      subtotal_cents integer NOT NULL,
      discount_cents integer NOT NULL DEFAULT 0,
      delivery_fee_cents integer NOT NULL DEFAULT 0,
      total_cents integer NOT NULL,
      notes text,
      include_cutlery boolean NOT NULL DEFAULT true,
      display_code text NOT NULL DEFAULT 'MK-001',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE order_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL,
      menu_item_id uuid,
      menu_item_name text NOT NULL,
      menu_item_price_cents integer NOT NULL,
      quantity integer NOT NULL,
      line_total_cents integer NOT NULL,
      notes text
    );
    CREATE TABLE order_item_modifiers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_item_id uuid NOT NULL,
      modifier_id uuid,
      modifier_name text NOT NULL,
      modifier_price_delta_cents integer NOT NULL DEFAULT 0
    );
    CREATE TABLE payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL,
      method text NOT NULL,
      amount_cents integer NOT NULL,
      status text NOT NULL DEFAULT 'succeeded',
      paid_at timestamptz
    );
    CREATE TABLE order_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id uuid NOT NULL,
      event_type text NOT NULL,
      old_value jsonb,
      new_value jsonb,
      actor_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `)
  await db.exec(
    await readFile(
      new URL('../supabase/migrations/071_pos_create_order.sql', import.meta.url),
      'utf8',
    ),
  )
})

beforeEach(async () => {
  await db.exec(`
    TRUNCATE orders, order_items, order_item_modifiers, payments, order_events;
    TRUNCATE restaurant_tables, menu_items, modifier_groups, modifiers, menu_item_modifier_groups;

    INSERT INTO restaurant_tables (id, label, is_active) VALUES
      ('${TABLE_ID}', 'T7', true),
      ('${INACTIVE_TABLE_ID}', 'Old Patio', false);

    INSERT INTO menu_items (id, name, price_cents, is_available) VALUES
      ('${MENU_ID}', 'Set Krapow Ayam', 1250, true),
      ('${REQUIRED_MENU_ID}', 'Krapow Daging', 1000, true),
      ('${SOLD_OUT_MENU_ID}', 'Sold Out Item', 900, false);

    INSERT INTO modifier_groups (id, name, min_selections, max_selections) VALUES
      ('${GROUP_ID}', 'Add-ons', 0, 2),
      ('${REQUIRED_GROUP_ID}', 'Spice', 0, 1);

    INSERT INTO modifiers (id, name, price_delta_cents, modifier_group_id, is_available) VALUES
      ('${MODIFIER_ID}', 'Fried Egg', 200, '${GROUP_ID}', true),
      ('${OTHER_MODIFIER_ID}', 'Extra Rice', 150, '${GROUP_ID}', true),
      ('${REQUIRED_MODIFIER_ID}', 'Medium Spice', 0, '${REQUIRED_GROUP_ID}', true);

    INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, is_required) VALUES
      ('${MENU_ID}', '${GROUP_ID}', false),
      ('${REQUIRED_MENU_ID}', '${REQUIRED_GROUP_ID}', true);
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('create_pos_order', () => {
  it('writes the order, lines, add-ons, payment and event atomically', async () => {
    const { rows } = await createOrder()
    const result = rows[0].result

    expect(result.total_cents).toBe(2900)
    expect(result.table_label).toBe('T7')
    expect(result.pax).toBe(2)
    expect(result.display_code).toBe('MK-001')

    expect(await counts()).toEqual({
      orders: 1,
      items: 1,
      modifiers: 1,
      payments: 1,
      events: 1,
    })

    const { rows: orderRows } = await db.query('SELECT * FROM orders')
    expect(orderRows[0]).toMatchObject({
      order_number: 'MK-TEST-1',
      status: 'paid',
      source: 'counter',
      delivery_type: 'dine_in',
      table_id: TABLE_ID,
      table_label: 'T7',
      pax: 2,
      payment_method: 'cash',
      customer_name: 'Aina',
      subtotal_cents: 2900,
      discount_cents: 0,
      delivery_fee_cents: 0,
      total_cents: 2900,
      notes: 'less spicy',
      include_cutlery: false,
    })

    const { rows: itemRows } = await db.query('SELECT * FROM order_items')
    expect(itemRows[0]).toMatchObject({
      menu_item_name: 'Set Krapow Ayam',
      menu_item_price_cents: 1250,
      quantity: 2,
      line_total_cents: 2900,
      notes: 'less rice',
    })

    const { rows: modifierRows } = await db.query('SELECT * FROM order_item_modifiers')
    expect(modifierRows[0]).toMatchObject({
      modifier_name: 'Fried Egg',
      modifier_price_delta_cents: 200,
    })

    const { rows: paymentRows } = await db.query('SELECT * FROM payments')
    expect(paymentRows[0]).toMatchObject({
      method: 'cash',
      amount_cents: 2900,
      status: 'succeeded',
    })

    const { rows: eventRows } = await db.query('SELECT * FROM order_events')
    expect(eventRows[0]).toMatchObject({
      event_type: 'created',
      actor_id: ACTOR,
    })
    expect(eventRows[0].new_value).toMatchObject({
      source: 'counter',
      order_type: 'dine_in',
      table_id: TABLE_ID,
      table_label: 'T7',
      pax: 2,
      payment_method: 'cash',
      total_cents: 2900,
    })
  })

  it('ignores any price fields in the payload and re-prices from the database', async () => {
    const { rows } = await createOrder(order(), [
      {
        menu_item_id: MENU_ID,
        quantity: 2,
        modifier_ids: [MODIFIER_ID],
        menu_item_price_cents: 1,
        line_total_cents: 1,
      },
    ])
    expect(rows[0].result.total_cents).toBe(2900)
    const { rows: itemRows } = await db.query('SELECT * FROM order_items')
    expect(itemRows[0].line_total_cents).toBe(2900)
  })

  it('rolls the whole order back when the payment insert fails', async () => {
    await db.exec(`
      CREATE OR REPLACE FUNCTION test_fail_payment() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'forced_payment_failure';
      END;
      $$;
      CREATE TRIGGER test_fail_payment_trigger
        BEFORE INSERT ON payments
        FOR EACH ROW EXECUTE FUNCTION test_fail_payment();
    `)

    try {
      await expect(createOrder()).rejects.toThrow(/forced_payment_failure/)
      expect(await counts()).toEqual({
        orders: 0,
        items: 0,
        modifiers: 0,
        payments: 0,
        events: 0,
      })
    } finally {
      await db.exec(`
        DROP TRIGGER IF EXISTS test_fail_payment_trigger ON payments;
        DROP FUNCTION IF EXISTS test_fail_payment();
      `)
    }
  })

  it('rejects an inactive table without writing a partial order', async () => {
    await expect(
      createOrder(order({ table_id: INACTIVE_TABLE_ID })),
    ).rejects.toThrow(/table_inactive/)
    expect(await counts()).toEqual({
      orders: 0,
      items: 0,
      modifiers: 0,
      payments: 0,
      events: 0,
    })
  })

  it('rejects an unavailable menu item', async () => {
    await expect(
      createOrder(order(), [{ menu_item_id: SOLD_OUT_MENU_ID, quantity: 1 }]),
    ).rejects.toThrow(/item_unavailable/)
    expect(await counts()).toEqual({
      orders: 0,
      items: 0,
      modifiers: 0,
      payments: 0,
      events: 0,
    })
  })

  it('rejects the same modifier twice', async () => {
    await expect(
      createOrder(order(), [
        { menu_item_id: MENU_ID, quantity: 1, modifier_ids: [MODIFIER_ID, MODIFIER_ID] },
      ]),
    ).rejects.toThrow(/duplicate_modifier/)
    expect((await counts()).orders).toBe(0)
  })

  it('rejects a modifier that is not attached to the item', async () => {
    await expect(
      createOrder(order(), [
        { menu_item_id: MENU_ID, quantity: 1, modifier_ids: [REQUIRED_MODIFIER_ID] },
      ]),
    ).rejects.toThrow(/invalid_modifier/)
    expect((await counts()).orders).toBe(0)
  })

  it('rejects a missing required add-on', async () => {
    await expect(
      createOrder(order(), [{ menu_item_id: REQUIRED_MENU_ID, quantity: 1 }]),
    ).rejects.toThrow(/required_modifier_missing/)
    expect((await counts()).orders).toBe(0)
  })

  it('rejects a take-away order that carries a table', async () => {
    await expect(
      createOrder(order({ order_type: 'take_away' })),
    ).rejects.toThrow(/invalid_order/)
    expect((await counts()).orders).toBe(0)
  })
})
