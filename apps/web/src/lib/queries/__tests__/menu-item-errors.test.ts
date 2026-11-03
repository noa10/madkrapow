import { beforeEach, describe, expect, it, vi } from 'vitest'

const maybeSingle = vi.fn()

// `unstable_cache` needs a Next request/store context; here we only care about
// what the wrapped function returns or throws.
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: async () => {
    throw new Error('getItemBySlug must not use the cookie-bound client')
  },
}))

const { getItemBySlug } = await import('@/lib/queries/menu')

describe('getItemBySlug error handling', () => {
  beforeEach(() => {
    maybeSingle.mockReset()
  })

  it('returns null when the row genuinely does not exist', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(getItemBySlug('no-such-item')).resolves.toBeNull()
  })

  it('throws on a query error so unstable_cache cannot memoise a 404', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'connection terminated unexpectedly', code: '08006' },
    })

    await expect(getItemBySlug('krapow-daging-sahaja')).rejects.toMatchObject({
      message: 'connection terminated unexpectedly',
    })
  })
})
