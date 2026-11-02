import { randomUUID } from 'node:crypto'
import type { getServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof getServiceClient>

/** A bounded lease serializes app-initiated updates across server instances. */
export async function claimMenuUpdate(db: ServiceClient, id: string): Promise<string | null> {
  const token = randomUUID()
  const { data, error } = await db.rpc('claim_grab_menu_update', { p_id: id, p_token: token })
  if (error) throw error
  return data ? token : null
}

export async function releaseMenuUpdate(db: ServiceClient, id: string, token: string): Promise<void> {
  const { error } = await db.from('channel_products')
    .update({ grab_menu_lease_token: null, grab_menu_lease_until: null })
    .eq('id', id).eq('grab_menu_lease_token', token)
  if (error) throw error
}

export function hasFutureMasterSnooze(snoozeTill: string | null, now = Date.now()): boolean {
  return Boolean(snoozeTill && Date.parse(snoozeTill) > now)
}
