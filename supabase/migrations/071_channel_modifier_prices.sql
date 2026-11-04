-- 071: Per-channel modifier prices.
--
--   * channel_modifiers — optional price override for a modifier per sales
--     channel. GrabFood prices add-ons separately from the item price, so a
--     modifier may need a different amount on Grab than on web/POS. Mirrors
--     channel_products.price_cents: NULL means "use modifiers.price_delta_cents".
--
-- Rollback: DROP TABLE channel_modifiers;

CREATE TABLE channel_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_id UUID NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('grabfood', 'foodpanda')),
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One price override per modifier per channel (the local modifier is the master).
  CONSTRAINT channel_modifiers_channel_modifier_unique UNIQUE (channel, modifier_id)
);

CREATE INDEX idx_channel_modifiers_modifier_id ON channel_modifiers(modifier_id);

CREATE TRIGGER set_channel_modifiers_updated_at
  BEFORE UPDATE ON channel_modifiers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE channel_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_channel_modifiers" ON channel_modifiers
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Catalog-adjacent pricing: admin/manager manage it (same as channel_products).
CREATE POLICY "admin_manager_all_channel_modifiers" ON channel_modifiers
  FOR ALL USING (is_admin_or_manager());
