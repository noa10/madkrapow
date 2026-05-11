BEGIN;

ALTER TABLE menu_items
  ADD COLUMN spice_level smallint NOT NULL DEFAULT 0
    CHECK (spice_level BETWEEN 0 AND 3),
  ADD COLUMN ingredients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN is_signature boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN menu_items.spice_level IS '0=mild, 1=medium, 2=hot, 3=Thai-hot';
COMMENT ON COLUMN menu_items.ingredients IS 'Display chips on rich menu card — free-form short ingredient names.';
COMMENT ON COLUMN menu_items.is_signature IS 'Featured on /menu hero spotlight when true. Max 2 enforced in application layer.';

CREATE INDEX IF NOT EXISTS idx_menu_items_is_signature ON menu_items (is_signature) WHERE is_signature = true;

COMMIT;
