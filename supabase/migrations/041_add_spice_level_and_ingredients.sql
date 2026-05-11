BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'menu_items' AND column_name = 'spice_level'
    ) THEN
        ALTER TABLE menu_items
          ADD COLUMN spice_level smallint NOT NULL DEFAULT 0
            CHECK (spice_level BETWEEN 0 AND 3);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'menu_items' AND column_name = 'ingredients'
    ) THEN
        ALTER TABLE menu_items
          ADD COLUMN ingredients text[] NOT NULL DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'menu_items' AND column_name = 'is_signature'
    ) THEN
        ALTER TABLE menu_items
          ADD COLUMN is_signature boolean NOT NULL DEFAULT false;
    END IF;
END $$;

COMMENT ON COLUMN menu_items.spice_level IS '0=mild, 1=medium, 2=hot, 3=Thai-hot';
COMMENT ON COLUMN menu_items.ingredients IS 'Display chips on rich menu card — free-form short ingredient names.';
COMMENT ON COLUMN menu_items.is_signature IS 'Featured on /menu hero spotlight when true. Max 2 enforced in application layer.';

CREATE INDEX IF NOT EXISTS idx_menu_items_is_signature ON menu_items (is_signature) WHERE is_signature = true;

COMMIT;
