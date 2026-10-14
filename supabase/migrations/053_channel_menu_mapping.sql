-- 053: Full-menu channel mapping + time-based sold-out (snooze).
--
--   * channel_categories — local category <-> external channel category mapping
--     (mirrors channel_products, which is item-level only). Needed so a full-menu
--     push can send CATEGORY records alongside ITEM records.
--   * snooze_till on menu_items + channel_products — Hubbo-style time-based
--     sold-out: an item is unavailable until the timestamp passes, then it
--     auto-restores (computed at read time; no cron restores anything).
--
-- Rollback: DROP TABLE channel_categories;
--           ALTER TABLE menu_items DROP COLUMN snooze_till;
--           ALTER TABLE channel_products DROP COLUMN snooze_till;

-- ========================================
-- PART A: channel_categories
-- ========================================
CREATE TABLE channel_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('grabfood', 'foodpanda')),
  external_category_id TEXT,
  external_name TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One mapping per category per channel (the local category is the master).
  CONSTRAINT channel_categories_channel_category_unique UNIQUE (channel, category_id)
);

-- External ids are optional (assigned by the channel when the category is pushed);
-- uniqueness is enforced only where an id exists.
CREATE UNIQUE INDEX channel_categories_channel_external_unique
  ON channel_categories(channel, external_category_id) WHERE external_category_id IS NOT NULL;

CREATE INDEX idx_channel_categories_category_id ON channel_categories(category_id);

CREATE TRIGGER set_channel_categories_updated_at
  BEFORE UPDATE ON channel_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- PART B: snooze_till (time-based sold-out)
-- ========================================
-- Master-level snooze hides the item on every channel; channel-level snooze
-- hides it on that channel only. NULL = not snoozed.
ALTER TABLE menu_items ADD COLUMN snooze_till TIMESTAMPTZ;
ALTER TABLE channel_products ADD COLUMN snooze_till TIMESTAMPTZ;

-- ========================================
-- PART C: RLS (matches the 049 channel-model policy set)
-- ========================================
ALTER TABLE channel_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_channel_categories" ON channel_categories
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Catalog-adjacent mapping: admin/manager manage it (same as channel_products).
CREATE POLICY "admin_manager_all_channel_categories" ON channel_categories
  FOR ALL USING (is_admin_or_manager());

-- menu_items snooze column rides the existing menu_items policies (anon SELECT,
-- admin/manager write) — no new policy needed.
