import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { claimPendingJobs } from '@/lib/printing/claim'

/**
 * Claim pending print jobs as a signed-in staff member.
 *
 * The merchant Android app calls this when realtime delivers a new order: the
 * phone is often the only device that can reach the thermal printer, so it
 * prints the kitchen docket and receipt itself. Claiming is idempotent across
 * clients — if the LAN bridge also polls, exactly one of them gets each job.
 *
 * Auth: staff session (admin/manager/cashier/kitchen).
 */
async function handle(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager', 'cashier', 'kitchen'])
  if ('error' in auth) return auth.error

  try {
    const jobs = await claimPendingJobs('staff')
    return NextResponse.json({ ok: true, jobs })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to claim print jobs' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
