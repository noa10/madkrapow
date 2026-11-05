import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'

// Rebuild the deployed analytics view from migration history in an in-memory
// PostgreSQL database, so the bucket reconciliation assertion runs against the
// same view definition the app queries.
let db

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL,
      source text NOT NULL DEFAULT 'web',
      delivery_type text NOT NULL,
      subtotal_cents integer NOT NULL,
      delivery_fee_cents integer NOT NULL DEFAULT 0,
      discount_cents integer NOT NULL DEFAULT 0,
      total_cents integer NOT NULL
    );
    CREATE TABLE order_items (
      menu_item_id uuid,
      menu_item_name text,
      quantity integer,
      line_total_cents integer,
      order_id uuid
    );
  `)
  for (const migration of [
    '023_analytics_views.sql',
    '048_fix_analytics_views.sql',
    '073_analytics_dine_in_count.sql',
  ]) {
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8')
    )
  }
  await db.exec(`
    INSERT INTO orders (created_at, status, delivery_type, subtotal_cents, total_cents)
    VALUES
      ('2026-11-06 09:00:00+00', 'paid', 'delivery', 2000, 2400),
      ('2026-11-06 10:00:00+00', 'paid', 'self_pickup', 1500, 1500),
      ('2026-11-06 11:00:00+00', 'ready', 'dine_in', 3000, 3000),
      ('2026-11-06 12:00:00+00', 'pending', 'delivery', 1000, 1400),
      ('2026-11-06 13:00:00+00', 'cancelled', 'dine_in', 1000, 1000);
  `)
})

afterAll(async () => {
  await db?.close()
})

describe('daily_order_summary delivery buckets', () => {
  it('splits dine-in into dine_in_count so all counted orders reconcile', async () => {
    const { rows } = await db.query(`
      SELECT order_count, delivery_count, pickup_count, dine_in_count
      FROM daily_order_summary
      WHERE order_date = '2026-11-06'
    `)

    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      order_count: 3,
      delivery_count: 1,
      pickup_count: 1,
      dine_in_count: 1,
    })
    expect(rows[0].delivery_count + rows[0].pickup_count + rows[0].dine_in_count).toBe(
      rows[0].order_count
    )
  })
})
