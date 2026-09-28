/**
 * Daily GrabFood reconciliation (cron, Bearer CRON_SECRET).
 *
 * Pulls Grab's List Orders for the requested day(s) (Grab caps the window at
 * 30 days) and compares against local channel_orders/payments. Mismatches are
 * reported, not auto-repaired — the admin decides.
 *
 * Revenue semantics: Grab's `price.total` includes delivery fees and
 * eater-side extras; our orders total the merchant food revenue
 * (subtotal - merchant-funded promos), so per-order comparisons compare
 * item sums, not customer-paid totals.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { createGrabFoodClient } from '@/lib/grabfood/client'
import type { GrabListOrdersResponse } from '@/lib/grabfood/types'
import { env } from '@/lib/validators/env'

export const dynamic = 'force-dynamic'

interface ReconcileRow {
  external_order_id: string
  external_order_number: string | null
  orders: { status: string; subtotal_cents: number; discount_cents: number; total_cents: number } | null
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = createGrabFoodClient()
  if (client.isMock) {
    return NextResponse.json({ skipped: true, message: 'GrabFood is in mock mode' })
  }

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('dateFrom') ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const dateTo = searchParams.get('dateTo') ?? dateFrom

  // Window sanity: Grab caps date-based retrieval at 30 days.
  const days =
    (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000
  if (Number.isNaN(days) || days < 0 || days > 30) {
    return NextResponse.json(
      { error: 'dateFrom/dateTo must span a window of 0-30 days' },
      { status: 400 }
    )
  }

  try {
    const grab = (await client.listOrders(dateFrom, dateTo)) as GrabListOrdersResponse
    const grabOrders = new Map(
      (grab.orders ?? []).map((o) => [o.orderID, o])
    )

    const supabase = getServiceClient()
    const { data: localRows, error } = await supabase
      .from('channel_orders')
      .select(
        'external_order_id, external_order_number, orders(status, subtotal_cents, discount_cents, total_cents)'
      )
      .eq('channel', 'grabfood')
      .in(
        'external_order_id',
        [...grabOrders.keys()].length > 0 ? [...grabOrders.keys()] : ['__none__']
      )

    if (error) {
      return NextResponse.json({ error: `Local query failed: ${error.message}` }, { status: 500 })
    }

    const localById = new Map(
      ((localRows ?? []) as unknown as ReconcileRow[]).map((r) => [r.external_order_id, r])
    )

    const missingLocally: string[] = []
    const missingOnGrab: string[] = [...localById.keys()].filter((id) => !grabOrders.has(id))
    const totalMismatches: Array<{ order: string; grab: number; local: number }> = []

    for (const [orderId, grabOrder] of grabOrders) {
      const local = localById.get(orderId)
      if (!local) {
        missingLocally.push(orderId)
        continue
      }
      const o = local.orders
      if (!o) continue
      // Compare merchant food revenue: subtotal (Grab) vs subtotal + discounts (ours).
      const grabItemValue = grabOrder.price?.subtotal ?? 0
      const localGrossValue = o.subtotal_cents
      if (Math.abs(grabItemValue - localGrossValue) > 0) {
        totalMismatches.push({
          order: local.external_order_number ?? orderId,
          grab: grabItemValue,
          local: localGrossValue,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      window: { dateFrom, dateTo },
      grabOrders: grabOrders.size,
      localOrders: localById.size,
      missingLocally,
      missingOnGrab,
      totalMismatches,
    })
  } catch (err) {
    console.error('[GrabFood Reconcile] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
