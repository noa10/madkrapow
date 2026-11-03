import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  getBrowserClient: () => ({ auth: { getSession } }),
}))

import { notifyGrabMenuAfterChange } from '../notify-client'

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  getSession.mockReset()
  getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } })
})

describe('notifyGrabMenuAfterChange', () => {
  it('posts with the admin bearer token and succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(notifyGrabMenuAfterChange()).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('/api/integrations/grabfood/menu/notification', {
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
    })
  })

  it('treats a disabled integration as a successful no-op', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 409 })))
    await expect(notifyGrabMenuAfterChange()).resolves.toBeNull()
  })

  it('returns the server detail when Grab notification fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Menu notification failed', detail: 'upstream timeout' }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        })
      )
    )
    await expect(notifyGrabMenuAfterChange()).resolves.toBe(
      'Menu notification failed: upstream timeout'
    )
  })

  it('returns a warning instead of throwing when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(notifyGrabMenuAfterChange()).resolves.toBe('network down')
  })

  it('does not call Grab without a session token', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(notifyGrabMenuAfterChange()).resolves.toBe(
      'You are not signed in; Grab was not notified.'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
