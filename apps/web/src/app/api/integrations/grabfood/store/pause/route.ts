import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { env } from '@/lib/validators/env'

/**
 * GrabFood store pause/unpause (admin/manager): one toggle from the admin UI
 * when the kitchen is overwhelmed. Mock mode answers with synthetic state.
 */
const pauseSchema = z.object({ paused: z.boolean() })

function checkIntegrationEnabled(): NextResponse | null {
  if (!env.GRABFOOD_ENABLED && env.GRABFOOD_ENV !== 'mock') {
    return NextResponse.json(
      { error: 'GrabFood integration is disabled (GRABFOOD_ENABLED=false)' },
      { status: 409 }
    )
  }
  return null
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  const disabled = checkIntegrationEnabled()
  if (disabled) return disabled

  const merchantId = env.GRABFOOD_MERCHANT_ID
  if (!merchantId) {
    return NextResponse.json({ error: 'GRABFOOD_MERCHANT_ID is not configured' }, { status: 400 })
  }

  try {
    const status = await createGrabFoodClient().getStoreStatus(merchantId)
    return NextResponse.json({
      ok: true,
      is_opened: status.isOpened ?? true,
      raw: status,
      environment: env.GRABFOOD_ENV,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Store status check failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager'])
  if ('error' in auth) return auth.error
  const disabled = checkIntegrationEnabled()
  if (disabled) return disabled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = pauseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid pause request', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const merchantId = env.GRABFOOD_MERCHANT_ID
  if (!merchantId) {
    return NextResponse.json({ error: 'GRABFOOD_MERCHANT_ID is not configured' }, { status: 400 })
  }

  try {
    await createGrabFoodClient().pauseStore(merchantId, parsed.data.paused)
    return NextResponse.json({
      ok: true,
      paused: parsed.data.paused,
      environment: env.GRABFOOD_ENV,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Store pause failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
