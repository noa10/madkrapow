-- Migration 040: Add unique slug column to menu_items for clean SEO-friendly URLs
-- Historical URLs used `/item/{slugified-name}--{uuid}`. We replace them with
-- `/item/{slug}` and rely on a permanent 301 redirect at the app layer for the
-- legacy pattern (see apps/web/src/app/item/[id]/page.tsx).

BEGIN;

-- 1. Add nullable slug column first (so we can backfill without violating NOT NULL).
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Slugify helper — lowercase, strip accents, non-alphanum → "-", trim edges.
CREATE OR REPLACE FUNCTION menu_items_slugify(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized TEXT;
BEGIN
    IF input IS NULL OR length(trim(input)) = 0 THEN
        RETURN 'item';
    END IF;
    normalized := lower(input);
    normalized := regexp_replace(normalized, '[^a-z0-9]+', '-', 'g');
    normalized := regexp_replace(normalized, '^-+|-+$', '', 'g');
    IF length(normalized) = 0 THEN
        RETURN 'item';
    END IF;
    RETURN normalized;
END;
$$;

-- 3. Backfill. Deduplicate by appending a short suffix from the item id when a
--    collision would occur (two items with identical names).
WITH ranked AS (
    SELECT
        id,
        menu_items_slugify(name) AS base_slug,
        row_number() OVER (PARTITION BY menu_items_slugify(name) ORDER BY created_at, id) AS rn
    FROM menu_items
    WHERE slug IS NULL OR slug = ''
)
UPDATE menu_items mi
SET slug = CASE
    WHEN r.rn = 1 THEN r.base_slug
    ELSE r.base_slug || '-' || substring(mi.id::text, 1, 8)
END
FROM ranked r
WHERE mi.id = r.id;

-- 4. Enforce NOT NULL + uniqueness going forward.
ALTER TABLE menu_items ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_slug_unique ON menu_items (slug);

-- 5. Trigger to auto-populate slug on insert / name change when empty.
CREATE OR REPLACE FUNCTION menu_items_set_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    candidate TEXT;
    suffix INT := 0;
    final TEXT;
BEGIN
    IF NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0 THEN
        RETURN NEW;
    END IF;
    candidate := menu_items_slugify(NEW.name);
    final := candidate;
    WHILE EXISTS (
        SELECT 1 FROM menu_items WHERE slug = final AND id <> NEW.id
    ) LOOP
        suffix := suffix + 1;
        final := candidate || '-' || suffix;
    END LOOP;
    NEW.slug := final;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_items_set_slug ON menu_items;
CREATE TRIGGER trg_menu_items_set_slug
    BEFORE INSERT OR UPDATE OF name, slug ON menu_items
    FOR EACH ROW EXECUTE FUNCTION menu_items_set_slug();

COMMIT;
