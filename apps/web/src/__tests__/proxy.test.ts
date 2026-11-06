import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  verifyAccessToken: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@/lib/supabase/middleware', () => ({
  refreshSession: mocks.refreshSession,
}))

vi.mock('@/lib/supabase/jwt', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}))

import { proxy } from '../proxy'

const CUSTOMER = { id: 'customer-1', app_metadata: {} }
const MANAGER = { id: 'staff-1', app_metadata: { role: 'manager' } }

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'))
}

function sessionReturns(token: string | null) {
  mocks.getSession.mockResolvedValue({
    data: { session: token ? { access_token: token } : null },
  })
}

function localUserReturns(user: unknown) {
  mocks.verifyAccessToken.mockResolvedValue(user)
}

function networkUserReturns(user: unknown) {
  mocks.getUser.mockResolvedValue({ data: { user } })
}

function redirectTarget(response: Response): URL {
  const location = response.headers.get('location')
  expect(location).toBeTruthy()
  return new URL(location!)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.refreshSession.mockResolvedValue({
    supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser } },
    response: NextResponse.next(),
  })
  sessionReturns(null)
  localUserReturns(null)
  networkUserReturns(null)
})

describe('anonymous visitors', () => {
  it('passes public pages through without checking auth', async () => {
    const response = await proxy(request('/'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled()
  })

  it('never redirects API routes', async () => {
    const response = await proxy(request('/api/orders'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('redirects /orders to the sign-in page with the return path', async () => {
    const response = await proxy(request('/orders'))

    expect(response.status).toBe(302)
    const target = redirectTarget(response)
    expect(target.pathname).toBe('/auth')
    expect(target.searchParams.get('redirect')).toBe('/orders')
  })

  it('redirects /checkout to sign-up with the return path', async () => {
    const response = await proxy(request('/checkout'))

    expect(response.status).toBe(302)
    const target = redirectTarget(response)
    expect(target.pathname).toBe('/auth/signup')
    expect(target.searchParams.get('redirect')).toBe('/checkout')
  })

  it('redirects /admin to sign-in with the return path', async () => {
    const response = await proxy(request('/admin/orders'))

    expect(response.status).toBe(302)
    const target = redirectTarget(response)
    expect(target.pathname).toBe('/auth')
    expect(target.searchParams.get('redirect')).toBe('/admin/orders')
  })

  it('lets anonymous visitors reach the auth screens', async () => {
    for (const path of ['/auth', '/auth/callback?code=abc', '/auth/update-password']) {
      const response = await proxy(request(path))
      expect(response.status, path).toBe(200)
      expect(response.headers.get('location'), path).toBeNull()
    }
  })
})

describe('session refresh on redirects', () => {
  function refreshedResponse(cookieName: string) {
    const refreshed = NextResponse.next()
    refreshed.cookies.set(cookieName, 'rotated', { path: '/' })
    mocks.refreshSession.mockResolvedValue({
      supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser } },
      response: refreshed,
    })
  }

  it('keeps cookies rotated during the request on a guard redirect', async () => {
    refreshedResponse('sb-access-token')

    const response = await proxy(request('/orders'))

    expect(response.status).toBe(302)
    expect(response.headers.get('set-cookie')).toContain('sb-access-token=rotated')
  })

  it('keeps rotated cookies on staff and signed-in auth redirects', async () => {
    sessionReturns('token')
    localUserReturns(CUSTOMER)
    refreshedResponse('sb-refresh-token')

    const authRedirect = await proxy(request('/auth'))
    const adminRedirect = await proxy(request('/admin'))

    expect(authRedirect.status).toBe(302)
    expect(authRedirect.headers.get('set-cookie')).toContain('sb-refresh-token=rotated')
    expect(adminRedirect.status).toBe(302)
    expect(adminRedirect.headers.get('set-cookie')).toContain('sb-refresh-token=rotated')
  })
})

describe('authenticated customers', () => {
  beforeEach(() => {
    sessionReturns('access-token')
    localUserReturns(CUSTOMER)
  })

  it('passes guarded customer pages through', async () => {
    for (const path of ['/orders', '/checkout']) {
      const response = await proxy(request(path))
      expect(response.status, path).toBe(200)
      expect(response.headers.get('location'), path).toBeNull()
    }
  })

  it('verifies the session token locally without a network call', async () => {
    await proxy(request('/orders'))

    expect(mocks.verifyAccessToken).toHaveBeenCalledWith('access-token')
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('redirects non-staff users away from admin routes', async () => {
    const response = await proxy(request('/admin'))

    expect(response.status).toBe(302)
    expect(redirectTarget(response).pathname).toBe('/')
  })

  it('redirects signed-in users away from the auth screens', async () => {
    const response = await proxy(request('/auth'))

    expect(response.status).toBe(302)
    expect(redirectTarget(response).pathname).toBe('/')
  })

  it('honours a valid relative redirect for signed-in users', async () => {
    const response = await proxy(request('/auth?redirect=/orders'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('blocks an open redirect to another origin', async () => {
    for (const attack of ['//evil.example', 'https://evil.example', '\\\\evil.example']) {
      const response = await proxy(request(`/auth?redirect=${encodeURIComponent(attack)}`))
      expect(response.status, attack).toBe(302)
      expect(redirectTarget(response).pathname, attack).toBe('/')
    }
  })

  it('never redirects away from the auth callback or password reset', async () => {
    for (const path of ['/auth/callback?code=abc', '/auth/update-password']) {
      const response = await proxy(request(path))
      expect(response.status, path).toBe(200)
      expect(response.headers.get('location'), path).toBeNull()
    }
  })
})

describe('authenticated staff', () => {
  beforeEach(() => {
    sessionReturns('staff-token')
    localUserReturns(MANAGER)
  })

  it('passes admin routes through', async () => {
    const response = await proxy(request('/admin/orders'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('sends staff from the auth screens to the admin dashboard', async () => {
    const response = await proxy(request('/auth'))

    expect(response.status).toBe(302)
    expect(redirectTarget(response).pathname).toBe('/admin')
  })
})

describe('network fallback', () => {
  it('falls back to getUser when local verification fails', async () => {
    sessionReturns('expired-token')
    localUserReturns(null)
    networkUserReturns(MANAGER)

    const response = await proxy(request('/admin'))

    expect(mocks.verifyAccessToken).toHaveBeenCalledWith('expired-token')
    expect(mocks.getUser).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('treats a session the network also rejects as anonymous', async () => {
    sessionReturns('bad-token')
    localUserReturns(null)
    networkUserReturns(null)

    const response = await proxy(request('/orders'))

    expect(response.status).toBe(302)
    expect(redirectTarget(response).pathname).toBe('/auth')
  })
})
