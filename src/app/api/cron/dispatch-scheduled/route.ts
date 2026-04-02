import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { fulfillScheduledOrder } from '@/lib/services/order-fulfillment'

export const dynamic = 'force-dynamic'

interface DispatchResult {
  orderId: string
  status: 'dispatched' | 'failed'
  error?: string
}

export async function POST(req: NextRequest) {
  try {
    // Auth: verify cron secret header
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )

    const now = new Date().toISOString()

    // Find orders ready for dispatch
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'paid')
      .eq('delivery_type', 'delivery')
      .eq('fulfillment_type', 'scheduled')
      .eq('dispatch_status', 'queued')
      .lte('dispatch_after', now)
      .is('lalamove_order_id', null)
      .limit(10)

    if (fetchError) {
      console.error('[Cron] Failed to fetch orders:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    if (!orders?.length) {
      return NextResponse.json({ dispatched: 0, message: 'No orders to dispatch' })
    }

    console.log(`[Cron] Found ${orders.length} orders to dispatch`)

    const results: DispatchResult[] = []

    for (const order of orders) {
      try {
        const result = await fulfillScheduledOrder(supabase, order.id)

        if (result.success) {
          console.log(`[Cron] Dispatched order ${order.id} -> Lalamove ${result.lalamoveOrderId}`)
          results.push({ orderId: order.id, status: 'dispatched' })
        } else {
          console.error(`[Cron] Failed to dispatch order ${order.id}:`, result.error)
          results.push({ orderId: order.id, status: 'failed', error: result.error })
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Cron] Error dispatching order ${order.id}:`, errorMessage)
        results.push({ orderId: order.id, status: 'failed', error: errorMessage })
      }
    }

    const dispatched = results.filter((r) => r.status === 'dispatched').length
    const failed = results.filter((r) => r.status === 'failed').length

    return NextResponse.json({ dispatched, failed, total: results.length, results })
  } catch (error) {
    console.error('[Cron] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
