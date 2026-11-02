import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { requireGrabFoodEnabled } from '@/lib/grabfood/guard'
import { cancelGrabOrder } from '@/lib/grabfood/order-actions'
import type { GrabCancelCode } from '@/lib/grabfood/types'

const CancelSchema = z.object({
  // Grab's documented cancel codes:
  // 1001 items unavailable, 1002 too many orders, 1003 shop closed,
  // 1004 shop closing soon.
  cancelCode: z.union([z.literal(1001), z.literal(1002), z.literal(1003), z.literal(1004)]).default(1001),
  reason: z.string().trim().max(500).optional(),
})

/**
 * Cancel a GrabFood order (admin/manager action).
 *
 * Goes through the shared channel-aware service: eligibility check, Grab's
 * cancel call with merchantID + cancelCode, then the local mirror.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error

  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ error: disabled.error }, { status: disabled.status })
  }

  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = CancelSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const result = await cancelGrabOrder(
    getServiceClient(),
    id,
    parsed.data.cancelCode as GrabCancelCode,
    { reason: parsed.data.reason }
  )

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail },
      { status: result.status }
    )
  }

  return NextResponse.json({
    ok: true,
    status: 'cancelled',
    ...(result.warning ? { warning: result.warning } : {}),
  })
}
