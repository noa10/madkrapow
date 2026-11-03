'use client'

import { getBrowserClient } from '@/lib/supabase/client'

/**
 * Ask Grab to pull the full menu after a local catalogue change.
 *
 * Returns null when the change was notified, or when the GrabFood integration
 * is intentionally disabled. Returns a human-readable warning when the local
 * change was saved but Grab could not be notified; callers must not roll back
 * the local save in that case.
 */
export async function notifyGrabMenuAfterChange(): Promise<string | null> {
  try {
    const supabase = getBrowserClient()
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return 'You are not signed in; Grab was not notified.'

    const response = await fetch('/api/integrations/grabfood/menu/notification', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })

    // 409 means GRABFOOD_ENABLED is false. The local save is still valid and
    // there is no Grab menu to refresh.
    if (response.status === 409) return null

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null
      const message = body?.error ?? `Grab menu notification failed (${response.status})`
      return body?.detail ? `${message}: ${body.detail}` : message
    }

    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'Grab menu notification failed'
  }
}
