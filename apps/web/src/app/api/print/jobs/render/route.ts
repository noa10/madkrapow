import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { loadPrintOrder } from '@/lib/printing/order-loader'
import { buildJobBytes } from '@/lib/printing/dispatch'
import { toBase64 } from '@/lib/printing/escpos'
import { env } from '@/lib/validators/env'

/**
 * Render a print job's ESC/POS bytes without claiming it — used by staff
 * reprint buttons (Hubbo's REPRINT watermark pattern) and by the bridge's
 * localhost /print relay.
 *
 * Auth: staff session (requireRole) OR the bridge secret (same Bearer as the
 * claim endpoint), so the bridge can serve manual prints from the POS pages.
 */
const renderSchema = z.object({
  order_id: z.string().uuid(),
  type: z.enum(['kitchen_docket', 'receipt', 'grabfood_ticket']),
  reprint: z.boolean().optional().default(true),
})

export async function POST(req: NextRequest) {
  const secret = env.PRINT_BRIDGE_SECRET
  const bearer = req.headers.get('authorization') ?? ''
  const isBridge = Boolean(secret) && bearer === `Bearer ${secret}`

  if (!isBridge) {
    const auth = await requireRole(req, ['admin', 'manager', 'cashier', 'kitchen'])
    if ('error' in auth) return auth.error
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = renderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid render request', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const supabase = getServiceClient()
  const order = await loadPrintOrder(supabase, parsed.data.order_id)
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const bytes = buildJobBytes(order, parsed.data.type, { reprint: parsed.data.reprint })
  return NextResponse.json({
    ok: true,
    order_id: parsed.data.order_id,
    order_number: order.orderNumber,
    type: parsed.data.type,
    reprint: parsed.data.reprint,
    bytes: toBase64(bytes),
  })
}
