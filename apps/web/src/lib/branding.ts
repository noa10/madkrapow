export type BrandingRow = {
  id: string
  logo_url: string | null
  hero_image_url: string | null
  store_name?: string | null
}

/**
 * `store_branding` is meant to be a single-row table, but older seeds could
 * insert a duplicate empty row (the original `ON CONFLICT DO NOTHING` had no
 * unique constraint to conflict with). Prefer the row that actually carries
 * branding so an empty duplicate cannot hide the real logo.
 */
export function pickCanonicalBrandingRow(rows: BrandingRow[]): BrandingRow | null {
  if (rows.length === 0) return null
  return rows.find((row) => row.logo_url || row.hero_image_url) ?? rows[0]
}
