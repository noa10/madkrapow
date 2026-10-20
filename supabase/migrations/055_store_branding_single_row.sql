-- `store_branding` is a single-row config, but migration 039 seeded it with
-- `INSERT ... ON CONFLICT DO NOTHING` without a unique constraint to conflict
-- with. Re-running the seed therefore appended an empty duplicate row, and
-- `.single()` writes (web admin + merchant app) started failing with
-- "Cannot coerce the result to a single JSON object".
--
-- Merge any non-null branding fields into the canonical row, delete the
-- duplicates, then enforce a single row so this cannot happen again.

WITH canonical AS (
  SELECT id
  FROM public.store_branding
  ORDER BY
    (logo_url IS NOT NULL OR hero_image_url IS NOT NULL) DESC,
    created_at ASC,
    id ASC
  LIMIT 1
),
merged AS (
  SELECT
    (SELECT logo_url
       FROM public.store_branding
      WHERE logo_url IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1) AS logo_url,
    (SELECT hero_image_url
       FROM public.store_branding
      WHERE hero_image_url IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1) AS hero_image_url
)
UPDATE public.store_branding b
SET
  logo_url = COALESCE(b.logo_url, m.logo_url),
  hero_image_url = COALESCE(b.hero_image_url, m.hero_image_url),
  updated_at = now()
FROM canonical c, merged m
WHERE b.id = c.id;

DELETE FROM public.store_branding b
WHERE b.id <> (
  SELECT id
  FROM public.store_branding
  ORDER BY
    (logo_url IS NOT NULL OR hero_image_url IS NOT NULL) DESC,
    created_at ASC,
    id ASC
  LIMIT 1
);

-- At most one row can exist. The next re-run of the old seed's
-- `ON CONFLICT DO NOTHING` will simply do nothing.
CREATE UNIQUE INDEX IF NOT EXISTS store_branding_single_row_idx
  ON public.store_branding ((true));
