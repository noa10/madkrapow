-- ============================================
-- 050: Legacy POS menu catalog (Desa Subang Permai)
-- ============================================
-- Seeds the catalog items that appear in the legacy Aliments POS export
-- (2026-03-01 → 2026-05-31, outlet "Mad Krapow - Desa Subang Permai") so the
-- legacy import can attach order_items to real menu_items rows.
--
-- These rows are historical book-keeping: the category and every item are
-- inactive/unavailable so the live D2C menu is unaffected. The importer stores
-- the actual legacy line prices as snapshots on order_items
-- (menu_item_price_cents / line_total_cents), so GrabFood/FoodPanda markups
-- (e.g. Set Krapow RM13 vs counter RM10) remain truthful regardless of the
-- base prices here — those are representative counter prices only.
--
-- Fixed UUIDs (prefix de5a = "Desa Subang") so the importer can reference them
-- without name lookups; re-running the seed is a no-op (ON CONFLICT DO NOTHING).

BEGIN;

-- Guard: the validate_admin_write() trigger allows service_role JWTs and
-- NULL-jwt (migration) contexts, so direct inserts here are fine.

INSERT INTO categories (id, name, description, sort_order, is_active)
VALUES (
  'de5a0000-0000-4000-8000-000000000000',
  'Legacy Menu (Desa Subang Permai)',
  'Historical catalog imported from the legacy Aliments POS export. Not sold via the online store.',
  999,
  false
)
ON CONFLICT (id) DO NOTHING;

WITH legacy_items (
  id, name, description, price_cents, slug, sort_order
) AS (
  VALUES
    ('de5a0000-0000-4000-8000-000000000001'::uuid, 'Krapow Kentang Ayam Kecil', 'Legacy counter item: Krapow Kentang (Kecil) + Ayam', 500,  'krapow-kentang-ayam-kecil', 1),
    ('de5a0000-0000-4000-8000-000000000002'::uuid, 'Krapow Kentang Daging Kecil', 'Legacy counter item: Krapow Kentang (Kecil) + Daging', 500,  'krapow-kentang-daging-kecil', 2),
    ('de5a0000-0000-4000-8000-000000000003'::uuid, 'Krapow Kentang Ayam Besar', 'Legacy counter item: Krapow Kentang (Besar) + Ayam', 1000, 'krapow-kentang-ayam-besar', 3),
    ('de5a0000-0000-4000-8000-000000000004'::uuid, 'Krapow Kentang Daging Besar', 'Legacy counter item: Krapow Kentang (Besar) + Daging', 1000, 'krapow-kentang-daging-besar', 4),
    ('de5a0000-0000-4000-8000-000000000005'::uuid, 'Popiah Krapow Ayam', 'Legacy counter item: Popiah Krapow + Ayam', 400,  'popiah-krapow-ayam-legacy', 5),
    ('de5a0000-0000-4000-8000-000000000006'::uuid, 'Popiah Krapow Daging', 'Legacy counter item: Popiah Krapow + Daging', 400,  'popiah-krapow-daging-legacy', 6),
    ('de5a0000-0000-4000-8000-000000000007'::uuid, 'Set Krapow Ayam', 'Legacy counter item: Set Krapow + Ayam', 1000, 'set-krapow-ayam-legacy', 7),
    ('de5a0000-0000-4000-8000-000000000008'::uuid, 'Set Krapow Daging', 'Legacy counter item: Set Krapow + Daging', 1000, 'set-krapow-daging-legacy', 8),
    ('de5a0000-0000-4000-8000-000000000009'::uuid, 'Set Krapow Ayam dengan Minuman', 'Legacy item: Set Krapow Ayam with drink', 1250, 'set-krapow-ayam-minuman-legacy', 9),
    ('de5a0000-0000-4000-8000-00000000000a'::uuid, 'Set Krapow Daging dengan Minuman', 'Legacy item: Set Krapow Daging with drink', 1250, 'set-krapow-daging-minuman-legacy', 10),
    ('de5a0000-0000-4000-8000-00000000000b'::uuid, 'Krapow Ayam Sahaja', 'Legacy counter item: Krapow Ayam only', 850,  'krapow-ayam-sahaja-legacy', 11),
    ('de5a0000-0000-4000-8000-00000000000c'::uuid, 'Krapow Daging Sahaja', 'Legacy counter item: Krapow Daging only', 850,  'krapow-daging-sahaja-legacy', 12),
    ('de5a0000-0000-4000-8000-00000000000d'::uuid, 'Nasi Putih Siam', 'Legacy counter item: Siam white rice', 200,  'nasi-putih-siam-legacy', 13),
    ('de5a0000-0000-4000-8000-00000000000e'::uuid, 'Telur Goreng', 'Legacy counter item: fried egg', 200,  'telur-goreng-legacy', 14),
    ('de5a0000-0000-4000-8000-00000000000f'::uuid, 'Kickapoo (320ml)', 'Legacy counter item: Kickapoo bottle', 250,  'kickapoo-320ml-legacy', 15),
    ('de5a0000-0000-4000-8000-000000000010'::uuid, 'Soya (300ml)', 'Legacy counter item: soya drink', 250,  'soya-300ml-legacy', 16),
    ('de5a0000-0000-4000-8000-000000000011'::uuid, 'Ice Lemon Tea (300ml)', 'Legacy counter item: ice lemon tea', 250,  'ice-lemon-tea-300ml-legacy', 17)
)
INSERT INTO menu_items (
  id, category_id, name, description, price_cents, is_available, sort_order, slug
)
SELECT
  li.id,
  'de5a0000-0000-4000-8000-000000000000',
  li.name,
  li.description,
  li.price_cents,
  false,
  li.sort_order,
  li.slug
FROM legacy_items li
ON CONFLICT (id) DO NOTHING;

-- The auto-slug trigger assigns slugs only when NULL; we supplied them, but a
-- prior partial run could have auto-slugged differently. Keep slugs authoritative.
UPDATE menu_items mi
SET slug = v.slug
FROM (VALUES
  ('de5a0000-0000-4000-8000-000000000001', 'krapow-kentang-ayam-kecil'),
  ('de5a0000-0000-4000-8000-000000000002', 'krapow-kentang-daging-kecil'),
  ('de5a0000-0000-4000-8000-000000000003', 'krapow-kentang-ayam-besar'),
  ('de5a0000-0000-4000-8000-000000000004', 'krapow-kentang-daging-besar'),
  ('de5a0000-0000-4000-8000-000000000005', 'popiah-krapow-ayam-legacy'),
  ('de5a0000-0000-4000-8000-000000000006', 'popiah-krapow-daging-legacy'),
  ('de5a0000-0000-4000-8000-000000000007', 'set-krapow-ayam-legacy'),
  ('de5a0000-0000-4000-8000-000000000008', 'set-krapow-daging-legacy'),
  ('de5a0000-0000-4000-8000-000000000009', 'set-krapow-ayam-minuman-legacy'),
  ('de5a0000-0000-4000-8000-00000000000a', 'set-krapow-daging-minuman-legacy'),
  ('de5a0000-0000-4000-8000-00000000000b', 'krapow-ayam-sahaja-legacy'),
  ('de5a0000-0000-4000-8000-00000000000c', 'krapow-daging-sahaja-legacy'),
  ('de5a0000-0000-4000-8000-00000000000d', 'nasi-putih-siam-legacy'),
  ('de5a0000-0000-4000-8000-00000000000e', 'telur-goreng-legacy'),
  ('de5a0000-0000-4000-8000-00000000000f', 'kickapoo-320ml-legacy'),
  ('de5a0000-0000-4000-8000-000000000010', 'soya-300ml-legacy'),
  ('de5a0000-0000-4000-8000-000000000011', 'ice-lemon-tea-300ml-legacy')
) AS v(id_text, slug)
WHERE mi.id::text = v.id_text AND mi.slug <> v.slug;

COMMIT;
