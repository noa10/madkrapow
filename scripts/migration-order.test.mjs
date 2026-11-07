import { describe, expect, it } from 'vitest'
import { readdir } from 'node:fs/promises'

describe('Supabase migration history', () => {
  it('assigns one migration file to each version', async () => {
    const files = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
    const byVersion = Object.groupBy(files, (name) => name.split('_')[0])
    const duplicateVersions = Object.entries(byVersion)
      .filter(([, names]) => names.length > 1)

    expect(duplicateVersions, 'Supabase identifies migrations by numeric version').toEqual([])
  })
})
