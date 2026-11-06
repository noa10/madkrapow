-- ============================================
-- 078: Widen channel CHECK constraints with shopeefood
-- ============================================
-- Context: the HubboPOS export (2024-11-01 → 2026-11-06) contains 362
-- ShopeeFood orders. The canonical CHECK constraints predate that channel, so
-- the import in card "Load real data from hubbo to madkrapow system" stored
-- them as source='counter' / channel='legacy_pos' / method='other' with the
-- ShopeeFood order number preserved in channel_orders and a note on the order.
--
-- This migration widens the three constraints and re-tags those rows so the
-- channel is first-class. It is idempotent: the UPDATEs only touch rows the
-- importer marked as ShopeeFood.
--
-- Requires DDL access (psql or the Supabase SQL editor) — the service-role REST
-- key cannot run ALTER TABLE.

BEGIN;

-- ============================================
-- 1. Widen the enums
-- ============================================
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_source_check;
ALTER TABLE orders ADD CONSTRAINT orders_source_check CHECK (
  source IN ('web', 'telegram', 'whatsapp', 'mobile', 'counter', 'grabfood', 'foodpanda', 'shopeefood')
);

ALTER TABLE channel_orders DROP CONSTRAINT IF EXISTS channel_orders_channel_check;
ALTER TABLE channel_orders ADD CONSTRAINT channel_orders_channel_check CHECK (
  channel IN ('grabfood', 'foodpanda', 'legacy_pos', 'shopeefood')
);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK (
  method IN ('stripe', 'cash', 'qr_pay', 'grabfood', 'foodpanda', 'shopeefood', 'other')
);

COMMENT ON COLUMN orders.source IS
  'Sales channel where the order was placed: web, telegram, whatsapp, mobile, counter, grabfood, foodpanda, or shopeefood.';

-- ============================================
-- 2. Re-tag the imported ShopeeFood rows
-- ============================================
-- The importer put the platform name in orders.notes; the channel identity
-- lives in channel_orders with the SF order number.
UPDATE orders o
SET source = 'shopeefood',
    notes = NULL
WHERE o.source = 'counter'
  AND o.notes LIKE 'ShopeeFood%'
  AND EXISTS (
    SELECT 1 FROM channel_orders co
    WHERE co.order_id = o.id
      AND co.channel = 'legacy_pos'
      AND co.external_order_number LIKE 'SF%'
  );

-- channel identity: SF numbers were booked as legacy_pos
UPDATE channel_orders
SET channel = 'shopeefood'
WHERE channel = 'legacy_pos'
  AND external_order_number LIKE 'SF%';

-- payments booked as 'other' for those orders
UPDATE payments p
SET method = 'shopeefood'
WHERE p.method = 'other'
  AND EXISTS (
    SELECT 1 FROM channel_orders co
    WHERE co.order_id = p.order_id
      AND co.channel = 'shopeefood'
  );

COMMIT;
