import { NextRequest, NextResponse } from 'next/server'
import { isBridgeRequest } from '@/lib/printing/bridge-auth'
import { claimPendingJobs } from '@/lib/printing/claim'
import { env } from '@/lib/validators/env'

/**
 * Claim pending print jobs (print bridge poll target).
 *
 * The bridge on the restaurant LAN polls this endpoint; the shared claim
 * routine inserts an `printed_<type>` event per job so a job prints exactly
 * once. Reprints never go through here; they use the render endpoint
 * explicitly.
 *
 * Auth: Bearer PRINT_BRIDGE_SECRET. Fails closed when the secret is unset in
 * production; local development may run without it.
 */
function assertBridgeAuth(req: NextRequest): NextResponse | null {
  const secret = env.PRINT_BRIDGE_SECRET
  if (!secret) {
    // Fail closed like the GrabFood webhooks: only explicit non-production
    // environments may operate without a configured secret.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'PRINT_BRIDGE_SECRET is not configured' }, { status: 503 })
    }
    return null
  }
  if (!isBridgeRequest(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Invalid bridge credentials' }, { status: 401 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const authError = assertBridgeAuth(req)
  if (authError) return authError

  try {
    const jobs = await claimPendingJobs('bridge')
    return NextResponse.json({ ok: true, jobs })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim print jobs' },
      { status: 500 }
    )
  }
}
