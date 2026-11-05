import { describe, expect, it, vi, beforeEach } from 'vitest'

const getClaimsMock = vi.fn()
const createClientMock = vi.fn((..._args: unknown[]) => ({
  auth: { getClaims: getClaimsMock },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: unknown, key: unknown, options: unknown) =>
    createClientMock(url, key, options),
}))

import { verifyAccessToken } from '../jwt'

const CLAIMS = {
  sub: 'user-1',
  email: 'admin@example.com',
  role: 'authenticated',
  aud: 'authenticated',
  app_metadata: { role: 'admin' },
  user_metadata: { full_name: 'Khairul' },
  session_id: 'session-1',
  aal: 'aal1',
}

describe('verifyAccessToken', () => {
  beforeEach(() => {
    getClaimsMock.mockReset()
    createClientMock.mockClear()
    getClaimsMock.mockResolvedValue({ data: null, error: null })
  })

  it('maps verified claims onto the User shape the routes read', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: CLAIMS }, error: null })
    const user = await verifyAccessToken('token-1')
    expect(user).toMatchObject({
      id: 'user-1',
      email: 'admin@example.com',
      role: 'authenticated',
      app_metadata: { role: 'admin' },
      user_metadata: { full_name: 'Khairul' },
    })
    expect(getClaimsMock).toHaveBeenCalledWith('token-1')
  })

  it('returns null for a missing token without verifying', async () => {
    expect(await verifyAccessToken(null)).toBeNull()
    expect(await verifyAccessToken(undefined)).toBeNull()
    expect(await verifyAccessToken('')).toBeNull()
    expect(getClaimsMock).not.toHaveBeenCalled()
  })

  it('returns null when verification errors', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: { message: 'stale' } })
    expect(await verifyAccessToken('token-1')).toBeNull()
  })

  it('returns null when getClaims throws', async () => {
    getClaimsMock.mockRejectedValue(new Error('jwks down'))
    expect(await verifyAccessToken('token-1')).toBeNull()
  })

  it('returns null when the claims carry no subject', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { email: 'x@example.com' } },
      error: null,
    })
    expect(await verifyAccessToken('token-1')).toBeNull()
  })

  it('reuses one module-level client so the JWKS cache survives', async () => {
    // Fresh module registry: prove the singleton on a first-load module, not
    // on the instance earlier tests already created.
    vi.resetModules()
    const localGetClaims = vi
      .fn()
      .mockResolvedValue({ data: { claims: CLAIMS }, error: null })
    const localCreate = vi.fn(() => ({ auth: { getClaims: localGetClaims } }))
    vi.doMock('@supabase/supabase-js', () => ({ createClient: localCreate }))

    const { verifyAccessToken: localVerify } = await import('../jwt')
    await localVerify('token-1')
    await localVerify('token-2')

    expect(localCreate).toHaveBeenCalledTimes(1)
  })
})
