import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { pullHubboMenu } from '@/lib/hubbo-merchant/menu'
import { env } from '@/lib/validators/env'

/**
 * Pull the Hubbo merchant menu (UNOFFICIAL alimentsBackend API) into the
 * local catalog. Admin/manager only, env-gated and default-off; dryRun=true
 * fetches and maps without writing anything.
 */
const pullSchema = z.object({
  dryRun: z.boolean().optional().default(false),
})

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  if (!env.HUBBO_MERCHANT_ENABLED) {
    return NextResponse.json(
      { error: 'Hubbo merchant adapter is disabled (HUBBO_MERCHANT_ENABLED=false)' },
      { status: 409 }
    )
  }

  let body: unknown = {}
  try {
    body = await req.json().catch(() => ({}))
  } catch {
    body = {}
  }
  const parsed = pullSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid pull request', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const result = await pullHubboMenu(getServiceClient(), { dryRun: parsed.data.dryRun })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[HubboMerchant] menu pull failed:', err)
    return NextResponse.json(
      { error: 'Menu pull failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
