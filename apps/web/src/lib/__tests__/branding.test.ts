import { describe, expect, it } from 'vitest'
import { pickCanonicalBrandingRow } from '@/lib/branding'

const row = (id: string, logo_url: string | null, hero_image_url: string | null) => ({
  id,
  logo_url,
  hero_image_url,
})

describe('pickCanonicalBrandingRow', () => {
  it('returns null when the table is empty', () => {
    expect(pickCanonicalBrandingRow([])).toBeNull()
  })

  it('prefers the row that has branding data over an empty duplicate', () => {
    const empty = row('empty', null, null)
    const branded = row('branded', '/logo.png', '/hero.png')

    expect(pickCanonicalBrandingRow([empty, branded])?.id).toBe('branded')
  })

  it('falls back to the first row when every row is empty', () => {
    const first = row('first', null, null)
    const second = row('second', null, null)

    expect(pickCanonicalBrandingRow([first, second])?.id).toBe('first')
  })
})
