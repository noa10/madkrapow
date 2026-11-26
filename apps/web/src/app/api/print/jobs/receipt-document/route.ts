import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { loadPrintOrder } from '@/lib/printing/order-loader'
import { buildGrabfoodTicket, buildKitchenDocket, buildReceipt } from '@/lib/printing/jobs'
import { renderReceiptHtml } from '@/lib/printing/receipt-html'
import { loadPrintStoreSettings } from '@/lib/printing/store-settings'
import { canStaffPrintOrder } from '@/lib/printing/staff-access'

const schema = z.object({
  order_id: z.string().uuid(),
  type: z.enum(['kitchen_docket', 'receipt', 'grabfood_ticket']).optional().default('receipt'),
})

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['admin', 'manager', 'cashier', 'kitchen'])
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })

  let order
  let store
  try {
    const supabase = getServiceClient()
    order = await loadPrintOrder(supabase, parsed.data.order_id)
    store = await loadPrintStoreSettings(supabase)
  } catch {
    return NextResponse.json({ error: 'Unable to load receipt' }, { status: 503 })
  }
  if (!order || !canStaffPrintOrder(auth.user.app_metadata?.role, order)) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const job = parsed.data.type === 'kitchen_docket'
    ? buildKitchenDocket(order, { reprint: true })
    : parsed.data.type === 'grabfood_ticket'
      ? buildGrabfoodTicket(order, { reprint: true })
      : buildReceipt(order, store, { reprint: true })
  return NextResponse.json(
    // The popup is about:blank, so the logo needs an absolute URL.
    { html: renderReceiptHtml(job, { logoUrl: new URL('/madkrapow-logo.png', req.nextUrl.origin).toString() }) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
