import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'
import { getServiceClient } from '@/lib/supabase/server'
import { loadPrintOrder } from '@/lib/printing/order-loader'
import { buildReceipt } from '@/lib/printing/jobs'
import { renderReceiptHtml } from '@/lib/printing/receipt-html'
import { canStaffPrintOrder } from '@/lib/printing/staff-access'
import { env } from '@/lib/validators/env'

const schema = z.object({ order_id: z.string().uuid() })

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
  try {
    order = await loadPrintOrder(getServiceClient(), parsed.data.order_id)
  } catch {
    return NextResponse.json({ error: 'Unable to load receipt' }, { status: 503 })
  }
  if (!order || !canStaffPrintOrder(auth.user.app_metadata?.role, order)) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  const receipt = buildReceipt(order, {
    name: 'Mad Krapow',
    address: env.STORE_ADDRESS ?? '',
    phone: env.STORE_PHONE ?? '',
  }, { reprint: true })
  return NextResponse.json({ html: renderReceiptHtml(receipt) }, { headers: { 'Cache-Control': 'no-store' } })
}
