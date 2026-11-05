import { describe, expect, it, vi, beforeEach } from 'vitest'

const refreshSessionMock = vi.fn()
const verifyAccessTokenMock = vi.fn()

vi.mock('../src/lib/supabase/middleware', () => ({
  refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
}))
vi.mock('../src/lib/supabase/jwt', () => ({
  verifyAccessToken: (...args: unknown[]) => verifyAccessTokenMock(...args),
}))

import { middleware } from '../middleware'

const STAFF_USER = { id: 'staff-1', app_metadata: { role: 'admin' } }

function request(pathname: string): import('next/server').NextRequest {
  return {
    nextUrl: {
      pathname,
      searchParams: new URLSearchParams(),
      clone: () => new URL(`http://localhost${pathname}`),
    },
  } as unknown as import('next/server').NextRequest
}

function ok() {
  return new Response(null, { status: 200 })
}

describe('middleware auth resolution', () => {
  let getSession: ReturnType<typeof vi.fn>
  let getUser: ReturnType<typeof vi.fn>

  beforeEach(() => {
    refreshSessionMock.mockReset()
    verifyAccessTokenMock.mockReset()
    getSession = vi.fn().mockResolvedValue({ data: { session: null } })
    getUser = vi.fn().mockResolvedValue({ data: { user: null } })
    refreshSessionMock.mockResolvedValue({
      supabase: { auth: { getSession, getUser } },
      response: ok(),
    })
    verifyAccessTokenMock.mockResolvedValue(null)
  })

  it('passes a locally verified staff user through to /admin', async () => {
    verifyAccessTokenMock.mockResolvedValue(STAFF_USER)

    const response = await middleware(request('/admin'))

    expect(response.status).toBe(200)
    expect(verifyAccessTokenMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the network getUser when local verification fails', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
    getUser.mockResolvedValue({ data: { user: STAFF_USER } })

    const response = await middleware(request('/admin'))

    expect(response.status).toBe(200)
    expect(getUser).toHaveBeenCalledTimes(1)
  })

  it('redirects an unauthenticated visitor from /admin to /auth', async () => {
    const response = await middleware(request('/admin'))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('/auth')
  })

  it('skips user resolution on routes without access rules', async () => {
    const response = await middleware(request('/menu'))

    expect(response.status).toBe(200)
    expect(verifyAccessTokenMock).not.toHaveBeenCalled()
  })

  it('redirects a non-staff user away from /admin', async () => {
    verifyAccessTokenMock.mockResolvedValue({
      id: 'customer-1',
      app_metadata: {},
    })

    const response = await middleware(request('/admin'))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost/')
  })
})
