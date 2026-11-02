/**
 * Daily GrabFood reconciliation (cron, Bearer CRON_SECRET).
 *
 * Uses Grab's documented List Orders contract: merchantID + date + page,
 * paging until `more` is false. Grab caps the window at 30 days and may cache
 * results for up to 30 minutes. The local day boundary is Malaysia time
 * (UTC+8), not UTC.
 *
 * List Orders is not available in Grab's staging environment; a staging run
 * therefore returns 409 unless ?force=1 is passed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import { env } from '@/lib/validators/env'

export const dynamic = 'force-dynamic'

const MYT_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 86_400_000

function mytDate(offsetDays = 0): string {
  return new Date(Date.now() + MYT_OFFSET_MS + offsetDays * DAY_MS).toISOString().slice(0, 10)
}

function mytDayBounds(date: string): { startUtc: string; endUtc: string } {
  const start = new Date(`${date}T00:00:00+08:00`)
  return {
    startUtc: start.toISOString(),
    endUtc: new Date(start.getTime() + DAY_MS).toISOString(),
  }
}

interface ReconcileRow {
  external_order_id: string
  external_order_number: string | null
  orders:
    | { status: string; subtotal_cents: number; discount_cents: number; total_cents: number }
    | Array<{ status: string; subtotal_cents: number; discount_cents: number; total_cents: number }>
    | null
}

function localOrder(row: ReconcileRow) {
  return Array.isArray(row.orders) ? row.orders[0] : row.orders
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = createGrabFoodClient()
  if (client.isMock) {
    return NextResponse.json({ skipped: true, message: 'GrabFood is in mock mode' })
  }

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? mytDate(-1)
  const force = searchParams.get('force') === '1'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00+08:00`).getTime())) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  // Grab only exposes the past 30 days (today inclusive).
  if (date < mytDate(-30) || date > mytDate(0)) {
    return NextResponse.json(
      { error: 'date must be within the last 30 days (Malaysia time)' },
      { status: 400 }
    )
  }
  if (env.GRABFOOD_ENV === 'staging' && !force) {
    return NextResponse.json(
      {
        error:
          'List Orders is unavailable in Grab staging. Validate pagination logic with fixtures and run the real check in the controlled production pilot (or pass ?force=1).',
      },
      { status: 409 }
    )
  }

  const merchantId = env.GRABFOOD_MERCHANT_ID
  if (!merchantId) {
    return NextResponse.json({ error: 'GRABFOOD_MERCHANT_ID is not configured' }, { status: 400 })
  }

  const { startUtc, endUtc } = mytDayBounds(date)

  try {
    const grab = await client.listAllOrders(merchantId, date)
    const grabOrders = new Map((grab.orders ?? []).map((order) => [order.orderID, order]))

    const supabase = getServiceClient()
    const { data: localRows, error } = await supabase
      .from('channel_orders')
      .select(
        'external_order_id, external_order_number, orders(status, subtotal_cents, discount_cents, total_cents)'
      )
      .eq('channel', 'grabfood')
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)

    if (error) {
      return NextResponse.json({ error: `Local query failed: ${error.message}` }, { status: 500 })
    }

    const localById = new Map(
      ((localRows ?? []) as unknown as ReconcileRow[]).map((row) => [row.external_order_id, row])
    )

    const missingLocally: string[] = []
    const missingOnGrab: string[] = []
    const mismatches: Array<{
      order: string
      field: 'subtotal' | 'discount' | 'total'
      grab: number
      local: number
    }> = []

    for (const [orderId, grabOrder] of grabOrders) {
      const local = localById.get(orderId)
      if (!local) {
        missingLocally.push(orderId)
        continue
      }
      const order = localOrder(local)
      if (!order) continue
      const grabSubtotal = grabOrder.price?.subtotal ?? 0
      const grabDiscount = grabOrder.price?.merchantFundPromo ?? 0
      const grabTotal = Math.max(grabSubtotal - grabDiscount, 0)
      const label = local.external_order_number ?? orderId

      if (Math.abs(grabSubtotal - order.subtotal_cents) > 0) {
        mismatches.push({ order: label, field: 'subtotal', grab: grabSubtotal, local: order.subtotal_cents })
      }
      if (Math.abs(grabDiscount - order.discount_cents) > 0) {
        mismatches.push({ order: label, field: 'discount', grab: grabDiscount, local: order.discount_cents })
      }
      if (Math.abs(grabTotal - order.total_cents) > 0) {
        mismatches.push({ order: label, field: 'total', grab: grabTotal, local: order.total_cents })
      }
    }

    for (const orderId of localById.keys()) {
      if (!grabOrders.has(orderId)) missingOnGrab.push(orderId)
    }

    return NextResponse.json({
      ok: missingLocally.length === 0 && missingOnGrab.length === 0 && mismatches.length === 0,
      date,
      window_utc: { start: startUtc, end: endUtc },
      grab_orders: grabOrders.size,
      local_orders: localById.size,
      missing_locally: missingLocally,
      missing_on_grab: missingOnGrab,
      mismatches,
    })
  } catch (err) {
    console.error('[GrabFood Reconcile] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
