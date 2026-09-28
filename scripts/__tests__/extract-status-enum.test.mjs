import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractStatusSetsFromSql,
  extractLatestStatusEnum,
} from '../extract-status-enum.mjs';

describe('extract-status-enum', () => {
  it('extracts the original CREATE TABLE CHECK constraint', () => {
    const sql = `CREATE TABLE orders (
      id UUID PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
      total_cents INTEGER
    );`;
    const sets = extractStatusSetsFromSql(sql);
    expect(sets).toEqual([['pending', 'paid', 'cancelled']]);
  });

  it('extracts an ALTER ... CHECK rewrite', () => {
    const sql = `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('pending', 'paid', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled')
);`;
    const sets = extractStatusSetsFromSql(sql);
    expect(sets.length).toBe(1);
    expect(sets[0]).toEqual([
      'pending',
      'paid',
      'accepted',
      'preparing',
      'ready',
      'picked_up',
      'delivered',
      'cancelled',
    ]);
  });

  it('returns the LATEST allowed values across multiple migration files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mk-migrations-'));
    writeFileSync(
      join(dir, '001_initial.sql'),
      `CREATE TABLE orders (status TEXT CHECK (status IN ('pending', 'paid', 'cancelled')));`
    );
    writeFileSync(
      join(dir, '008_widen.sql'),
      `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('pending','paid','accepted','preparing','ready','picked_up','delivered','cancelled')
);`
    );
    writeFileSync(
      join(dir, '023_unrelated.sql'),
      `-- This view filters by status but does not redefine the constraint.
       CREATE OR REPLACE VIEW v AS SELECT * FROM orders WHERE status IN ('paid','preparing');`
    );
    const enumValues = extractLatestStatusEnum(dir);
    expect(enumValues).toEqual([
      'pending',
      'paid',
      'accepted',
      'preparing',
      'ready',
      'picked_up',
      'delivered',
      'cancelled',
    ]);
  });

  it('ignores status CHECK constraints on non-orders tables (e.g. payments in 049)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mk-migrations-side-table-'));
    writeFileSync(
      join(dir, '008_widen.sql'),
      `ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('pending','paid','accepted','preparing','ready','picked_up','delivered','cancelled')
);`
    );
    writeFileSync(
      join(dir, '049_channel_model.sql'),
      `CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded'))
);
CREATE TABLE channel_orders (
  id UUID PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('grabfood', 'foodpanda', 'legacy_pos'))
);`
    );
    const enumValues = extractLatestStatusEnum(dir);
    expect(enumValues).toEqual([
      'pending',
      'paid',
      'accepted',
      'preparing',
      'ready',
      'picked_up',
      'delivered',
      'cancelled',
    ]);
  });

  it('throws when no CHECK constraint is found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mk-migrations-empty-'));
    writeFileSync(join(dir, '001_noop.sql'), '-- nothing here');
    expect(() => extractLatestStatusEnum(dir)).toThrow(/No orders_status_check/);
  });

  it('matches the actual madkrapow migrations', () => {
    // Resolve repo root from this test file's location.
    const repoRoot = join(import.meta.dirname ?? '', '..', '..');
    const dir = join(repoRoot, 'supabase', 'migrations');
    const enumValues = extractLatestStatusEnum(dir);
    expect(enumValues).toEqual([
      'pending',
      'paid',
      'accepted',
      'preparing',
      'ready',
      'picked_up',
      'delivered',
      'cancelled',
    ]);
  });
});
