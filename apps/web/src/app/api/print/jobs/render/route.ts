import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { loadPrintOrder } from '@/lib/printing/order-loader'
import { canStaffPrintOrder } from '@/lib/printing/staff-access'
import { isBridgeRequest } from '@/lib/printing/bridge-auth'
import { buildJobBytes } from '@/lib/printing/dispatch'
import { loadPrintStoreSettings } from '@/lib/printing/store-settings'
import { toBase64 } from '@/lib/printing/escpos'

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
  const isBridge = isBridgeRequest(req.headers.get('authorization'))

  let staffRole: string | undefined
  if (!isBridge) {
    const auth = await requireRole(req, ['admin', 'manager', 'cashier', 'kitchen'])
    if ('error' in auth) return auth.error
    staffRole = auth.user.app_metadata?.role as string | undefined
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
  let order
  try {
    order = await loadPrintOrder(supabase, parsed.data.order_id)
  } catch {
    return NextResponse.json({ error: 'Unable to load order for printing' }, { status: 503 })
  }
  if (!order || (!isBridge && !canStaffPrintOrder(staffRole, order))) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const settings = await loadPrintStoreSettings(supabase)
  const bytes = buildJobBytes(order, parsed.data.type, {
    reprint: parsed.data.reprint,
    store: settings,
  })
  return NextResponse.json({
    ok: true,
    order_id: parsed.data.order_id,
    order_number: order.orderNumber,
    type: parsed.data.type,
    reprint: parsed.data.reprint,
    bytes: toBase64(bytes),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
