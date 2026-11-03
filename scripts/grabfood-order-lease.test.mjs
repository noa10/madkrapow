import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

// An in-memory PostgreSQL database: this test never connects to the POS DB.
let db
const id = '11111111-1111-4111-8111-111111111111'
const payload = {
  order: { order_number: 'test-001', status: 'paid', source: 'grabfood', delivery_type: 'delivery', fulfillment_type: 'asap', subtotal_cents: 100, total_cents: 100 },
  items: [{ menu_item_id: '33333333-3333-4333-8333-333333333333', menu_item_name: 'Test item', menu_item_price_cents: 100, quantity: 1, line_total_cents: 100 }],
  payment: { method: 'other', amount_cents: 100 },
  channelOrder: { channel: 'grabfood', external_order_id: 'sandbox-test' },
  sourceEventId: id, sourceEventAttempts: 0,
}
const apply = (value) => db.query('SELECT apply_channel_order($1::jsonb) AS result', [JSON.stringify(value)])

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE integration_events(id uuid primary key, status text, attempts int, locked_until timestamptz, error text, processed_at timestamptz, payload jsonb);
    CREATE TABLE orders(id uuid primary key default gen_random_uuid(), order_number text unique, status text, source text, delivery_type text, fulfillment_type text, scheduled_for timestamptz, subtotal_cents int, discount_cents int, delivery_fee_cents int, total_cents int, customer_id uuid, customer_name text, notes text, include_cutlery boolean, updated_at timestamptz);
    CREATE TABLE order_items(order_id uuid, menu_item_id uuid, menu_item_name text, menu_item_price_cents int, quantity int, line_total_cents int, notes text);
    CREATE TABLE payments(order_id uuid, method text, amount_cents int, status text, external_ref text, paid_at timestamptz, raw jsonb, updated_at timestamptz);
    CREATE TABLE channel_orders(id uuid primary key default gen_random_uuid(), order_id uuid, channel text, external_order_id text, external_order_number text, external_store_id text, external_status text, raw_payload jsonb, updated_at timestamptz, CONSTRAINT channel_orders_channel_external_unique UNIQUE(channel,external_order_id));
    CREATE TABLE order_events(order_id uuid, event_type text, new_value jsonb);
  `)
  await db.exec(await readFile(new URL('../supabase/migrations/070_grabfood_fix_order_event_lease.sql', import.meta.url), 'utf8'))
})
afterAll(async () => { await db?.close() })

describe('GrabFood order import event lease', () => {
  it('rejects a missing lease without writing an order', async () => {
    const { rows } = await apply(payload)
    expect(rows[0].result).toMatchObject({ status: 'error', reason: 'event lease lost' })
    expect((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n).toBe(0)
  })
  it('rejects an expired or reclaimed lease', async () => {
    await db.query("INSERT INTO integration_events(id,status,attempts,locked_until) VALUES($1,'received',1,now()-interval '1 minute')", [id])
    expect((await apply(payload)).rows[0].result.reason).toBe('event lease lost')
    await db.query("UPDATE integration_events SET locked_until=now()+interval '1 minute' WHERE id=$1", [id])
    expect((await apply(payload)).rows[0].result.reason).toBe('event lease lost')
  })
  it('atomically imports one order with a valid lease and deduplicates a replay', async () => {
    await db.query('UPDATE integration_events SET attempts=0 WHERE id=$1', [id])
    expect((await apply(payload)).rows[0].result.status).toBe('created')
    const secondId = '22222222-2222-4222-8222-222222222222'
    await db.query("INSERT INTO integration_events(id,status,attempts,locked_until) VALUES($1,'received',0,now()+interval '1 minute')", [secondId])
    expect((await apply({ ...payload, sourceEventId: secondId })).rows[0].result.status).toBe('skipped')
    const { rows } = await db.query('SELECT (SELECT count(*)::int FROM orders) AS orders, (SELECT count(*)::int FROM order_items) AS items, (SELECT count(*)::int FROM payments) AS payments, (SELECT count(*)::int FROM channel_orders) AS channels, (SELECT status FROM integration_events WHERE id=$1) AS status', [id])
    expect(rows[0]).toEqual({ orders: 1, items: 1, payments: 1, channels: 1, status: 'processed' })
  })
})
