import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { env } from '@/lib/validators/env'

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
      {
        cookies: {
          getAll() {
            return []
          },
          setAll() {},
        },
      }
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
        const address = order.delivery_address_json as Record<string, string> | null

        if (!address) {
          throw new Error('No delivery address on order')
        }

        const lalamove = createLalamoveClient()

        const lalamoveOrder = await lalamove.placeOrder({
          sender: {
            location: {
              street: env.STORE_ADDRESS,
              city: env.STORE_CITY,
              country: 'MY',
            },
            contact: {
              name: 'Mad Krapow Store',
              phone: env.STORE_PHONE,
            },
          },
          recipient: {
            location: {
              street: address.address,
              city: address.city,
              country: 'MY',
              zipcode: address.postalCode,
            },
            contact: {
              name: address.fullName,
              phone: address.phone,
            },
          },
          scheduleAt: order.scheduled_for,
          requestTemplate: {
            serviceType: 'MOTORCYCLE',
            specialInstructions: `Order ID: ${order.id}`,
          },
        })

        await supabase
          .from('orders')
          .update({
            lalamove_order_id: lalamoveOrder.orderId,
            lalamove_status: lalamoveOrder.status,
            dispatch_status: 'submitted',
          })
          .eq('id', order.id)

        await supabase.from('order_events').insert({
          order_id: order.id,
          event_type: 'dispatch_submitted',
          new_value: { lalamove_order_id: lalamoveOrder.orderId },
        })

        console.log(`[Cron] Dispatched order ${order.id} -> Lalamove ${lalamoveOrder.orderId}`)
        results.push({ orderId: order.id, status: 'dispatched' })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Cron] Failed to dispatch order ${order.id}:`, errorMessage)

        await supabase
          .from('orders')
          .update({ dispatch_status: 'failed' })
          .eq('id', order.id)

        await supabase.from('order_events').insert({
          order_id: order.id,
          event_type: 'dispatch_failed',
          new_value: { error: errorMessage },
        })

        results.push({ orderId: order.id, status: 'failed', error: errorMessage })
      }
    }

    const dispatched = results.filter((r) => r.status === 'dispatched').length
    const failed = results.filter((r) => r.status === 'failed').length

    return NextResponse.json({
      dispatched,
      failed,
      total: results.length,
      results,
    })
  } catch (error) {
    console.error('[Cron] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
