-- ============================================
-- 077: Legacy catalog for HubboPOS-only items
-- ============================================
-- The HubboPOS export (Report → Detail → "Order with Items", 2024-11-01 →
-- 2026-11-06) contains six menu items that never existed in the canonical
-- catalog. They are seeded here under an inactive legacy category so the live
-- D2C menu is unaffected — same approach as 050_legacy_menu.sql.
--
-- Item prices are representative POS prices. The importer stores the real
-- per-line price as a snapshot on order_items (menu_item_price_cents), so these
-- values never affect historical totals.
--
-- IDs use the de5b prefix to keep them disjoint from 050's de5a rows.
-- Re-running is a no-op (ON CONFLICT DO NOTHING).

BEGIN;

INSERT INTO categories (id, name, description, sort_order, is_active)
VALUES (
  'de5b0000-0000-4000-8000-000000000000',
  'Legacy Menu (HubboPOS 2024-2026)',
  'Historical catalog items that appear only in the HubboPOS export. Not sold via the online store.',
  999,
  false
)
ON CONFLICT (id) DO NOTHING;

WITH legacy_items (id, name, description, price_cents, slug, sort_order) AS (
  VALUES
    ('de5b0000-0000-4000-8000-000000000001'::uuid, 'Beef & Chicken Krapow Set', 'Legacy combo: beef + chicken krapow set (POS only, retired Apr 2025)', 2000, 'beef-chicken-krapow-set-legacy', 1),
    ('de5b0000-0000-4000-8000-000000000002'::uuid, 'Container Charge', 'Legacy packaging surcharge (FoodPanda)', 30, 'container-charge-legacy', 2),
    ('de5b0000-0000-4000-8000-000000000003'::uuid, 'Winter Melon (300ml)', 'Legacy drink: winter melon tea', 250, 'winter-melon-300ml-legacy', 3),
    ('de5b0000-0000-4000-8000-000000000004'::uuid, 'Set Krapow Kambing', 'Legacy counter item: mutton krapow set', 1350, 'set-krapow-kambing-legacy', 4),
    ('de5b0000-0000-4000-8000-000000000005'::uuid, 'Set Krapow Kambing Dengan Minuman', 'Legacy item: mutton krapow set with drink', 1550, 'set-krapow-kambing-dengan-minuman-legacy', 5),
    ('de5b0000-0000-4000-8000-000000000006'::uuid, 'Pes Krapow', 'Legacy item: krapow paste', 500, 'pes-krapow-legacy', 6)
)
INSERT INTO menu_items (id, category_id, name, description, price_cents, is_available, sort_order, slug)
SELECT
  li.id,
  'de5b0000-0000-4000-8000-000000000000',
  li.name,
  li.description,
  li.price_cents,
  false,
  li.sort_order,
  li.slug
FROM legacy_items li
ON CONFLICT (id) DO NOTHING;

COMMIT;
