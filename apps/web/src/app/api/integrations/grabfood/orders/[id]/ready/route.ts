import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { markGrabOrderReady } from '@/lib/grabfood/order-actions'

/**
 * Mark a GrabFood order ready (staff action).
 *
 * Local state first, then Grab's documented Mark Ready call with markStatus.
 * The service enforces Grab's once-only rule and refuses to blindly retry an
 * ambiguous timeout; `retryUncertain: true` is an explicit operator decision.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'manager', 'cashier', 'kitchen'])
  if ('error' in auth) return auth.error

  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ error: disabled.error }, { status: disabled.status })
  }

  const { id } = await params
  let body: { retryUncertain?: boolean } = {}
  try {
    body = (await req.json()) as { retryUncertain?: boolean }
  } catch {
    // Body is optional.
  }

  const result = await markGrabOrderReady(getServiceClient(), id, {
    retryUncertain: body?.retryUncertain === true,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, uncertain: result.uncertain, detail: result.detail },
      { status: result.status }
    )
  }

  return NextResponse.json({
    ok: true,
    status: 'ready',
    ...(result.warning ? { warning: result.warning } : {}),
  })
}
