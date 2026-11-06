import { describe, expect, it, vi, beforeEach } from 'vitest'

const createServerClientMock = vi.fn()
const createClientMock = vi.fn()
const cookiesMock = vi.fn()
const verifyAccessTokenMock = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}))
vi.mock('next/headers', () => ({
  cookies: (...args: unknown[]) => cookiesMock(...args),
}))
vi.mock('../jwt', () => ({
  verifyAccessToken: (...args: unknown[]) => verifyAccessTokenMock(...args),
}))

import { getAuthenticatedUser } from '../server'

const NETWORK_USER = {
  id: 'network-user',
  app_metadata: { role: 'cashier' },
}

function cookieClientWith(session: unknown) {
  return {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }
}

function authRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { headers }) as unknown as Request
}

describe('getAuthenticatedUser', () => {
  beforeEach(() => {
    createServerClientMock.mockReset()
    createClientMock.mockReset()
    cookiesMock.mockReset()
    verifyAccessTokenMock.mockReset()
    cookiesMock.mockResolvedValue([])
    verifyAccessTokenMock.mockResolvedValue(null)
    createClientMock.mockReturnValue({ auth: {} })
  })

  it('verifies the cookie session locally and skips the network round trip', async () => {
    const localUser = { id: 'local-user', app_metadata: { role: 'admin' } }
    const client = cookieClientWith({ access_token: 'tok-1' })
    createServerClientMock.mockReturnValue(client)
    verifyAccessTokenMock.mockResolvedValue(localUser)

    const { user, supabase } = await getAuthenticatedUser(authRequest())

    expect(user).toEqual(localUser)
    expect(supabase).not.toBeNull()
    expect(verifyAccessTokenMock).toHaveBeenCalledWith('tok-1')
    expect(client.auth.getUser).not.toHaveBeenCalled()
  })

  it('falls back to the network getUser when local verification fails', async () => {
    const client = cookieClientWith({ access_token: 'tok-1' })
    client.auth.getUser.mockResolvedValue({ data: { user: NETWORK_USER }, error: null })
    createServerClientMock.mockReturnValue(client)

    const { user, supabase } = await getAuthenticatedUser(authRequest())

    expect(user).toEqual(NETWORK_USER)
    expect(supabase).not.toBeNull()
    expect(client.auth.getUser).toHaveBeenCalledTimes(1)
  })

  it('verifies the bearer header locally without touching the cookie client', async () => {
    const bearerUser = { id: 'mobile-user', app_metadata: { role: 'manager' } }
    const client = cookieClientWith(null)
    createServerClientMock.mockReturnValue(client)
    verifyAccessTokenMock
      .mockResolvedValueOnce(null) // cookie path: no session
      .mockResolvedValueOnce(bearerUser) // bearer path

    const { user, supabase } = await getAuthenticatedUser(
      authRequest({ Authorization: 'Bearer mobile-token' })
    )

    expect(user).toEqual(bearerUser)
    expect(supabase).not.toBeNull()
    expect(verifyAccessTokenMock).toHaveBeenNthCalledWith(2, 'mobile-token')
    expect(client.auth.getUser).not.toHaveBeenCalled()
  })

  it('returns unauthenticated for an anonymous request without a network call', async () => {
    const client = cookieClientWith(null)
    createServerClientMock.mockReturnValue(client)

    const { user, supabase } = await getAuthenticatedUser(authRequest())

    expect(user).toBeNull()
    expect(supabase).toBeNull()
    expect(client.auth.getUser).not.toHaveBeenCalled()
  })

  it('keeps the bearer network fallback when local verification rejects both', async () => {
    const client = cookieClientWith(null)
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    createServerClientMock.mockReturnValue(client)
    verifyAccessTokenMock.mockResolvedValue(null)
    createClientMock.mockImplementationOnce(() => ({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: NETWORK_USER }, error: null }),
      },
    }))

    const { user, supabase } = await getAuthenticatedUser(
      authRequest({ Authorization: 'Bearer mobile-token' })
    )

    expect(user).toEqual(NETWORK_USER)
    expect(supabase).not.toBeNull()
    expect(verifyAccessTokenMock).toHaveBeenCalledTimes(2)
    expect(client.auth.getUser).toHaveBeenCalledTimes(1)
  })

  it('returns null when every path fails', async () => {
    const client = cookieClientWith({ access_token: 'tok-1' })
    createServerClientMock.mockReturnValue(client)

    const { user, supabase } = await getAuthenticatedUser(authRequest())

    expect(user).toBeNull()
    expect(supabase).toBeNull()
  })
})
