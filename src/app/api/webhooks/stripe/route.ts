import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/validators/env'
import { createStripeClient } from '@/lib/stripe/client'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { createServerClient } from '@supabase/ssr'

interface StripeWebhookResponse {
  success: true
}

interface StripeWebhookError {
  success: false
  error: string
}

type WebhookResult = StripeWebhookResponse | StripeWebhookError

function getStoreLocation() {
  return {
    address: env.STORE_ADDRESS,
    city: env.STORE_CITY,
    phone: env.STORE_PHONE,
  }
}

async function triggerLalamoveDelivery(orderId: string, deliveryAddress: Record<string, unknown>) {
  const lalamove = createLalamoveClient()
  const store = getStoreLocation()

  const recipient = deliveryAddress as {
    fullName: string
    phone: string
    address: string
    postalCode: string
    city: string
    state: string
  }

  try {
    const order = await lalamove.placeOrder({
      sender: {
        location: {
          street: store.address,
          city: store.city,
          country: 'MY' as const,
        },
        contact: {
          name: 'Mad Krapow Store',
          phone: store.phone,
        },
      },
      recipient: {
        location: {
          street: recipient.address,
          city: recipient.city,
          country: 'MY' as const,
          zipcode: recipient.postalCode,
        },
        contact: {
          name: recipient.fullName,
          phone: recipient.phone,
        },
      },
      scheduleAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      requestTemplate: {
        serviceType: 'MOTORCYCLE',
        specialInstructions: `Order ID: ${orderId}`,
      },
    })

    console.log('[Webhook] Lalamove order placed:', order.orderId)
    return order
  } catch (error) {
    console.error('[Webhook] Failed to place Lalamove order:', error)
    throw error
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<WebhookResult>> {
  try {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { success: false, error: 'Missing stripe-signature header' },
        { status: 400 }
      )
    }

    let event

    try {
      const stripeClient = createStripeClient()
      event = stripeClient.verifyWebhookSignature(body, signature)
    } catch (sigError) {
      console.error('[Webhook] Invalid signature:', sigError)
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 400 }
      )
    }

    if (event.type !== 'checkout.session.completed') {
      console.log('[Webhook] Ignoring event type:', event.type)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const session = event.data.object as { id: string; metadata?: Record<string, string> }
    const orderId = session.metadata?.order_id

    if (!orderId) {
      console.error('[Webhook] No order_id in session metadata')
      return NextResponse.json(
        { success: false, error: 'Missing order_id in metadata' },
        { status: 400 }
      )
    }

    // Use service_role key for webhook operations (bypasses RLS)
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

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('[Webhook] Order not found:', orderId)
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    // Idempotency: skip if already paid
    if (order.status === 'paid' || order.status === 'accepted' || order.status === 'preparing') {
      console.log('[Webhook] Order already processed:', orderId)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Mark order as paid
    const { error: paidError } = await supabase
      .from('orders')
      .update({ status: 'paid', stripe_payment_intent_id: session.id })
      .eq('id', orderId)

    if (paidError) {
      console.error('[Webhook] Failed to mark order as paid:', orderId, paidError)
      return NextResponse.json(
        { success: false, error: 'Failed to update order status' },
        { status: 500 }
      )
    }

    // Branch: delivery type and fulfillment type
    const deliveryType = order.delivery_type || 'delivery'
    const fulfillmentType = order.fulfillment_type || 'asap'

    if (deliveryType === 'self_pickup') {
      // Self-pickup: no delivery booking, move straight to accepted
      const { error: acceptedError } = await supabase
        .from('orders')
        .update({
          status: 'accepted',
          dispatch_status: 'not_ready',
        })
        .eq('id', orderId)

      if (acceptedError) {
        console.error('[Webhook] Failed to accept self-pickup order:', orderId, acceptedError)
        return NextResponse.json(
          { success: false, error: 'Failed to update self-pickup order' },
          { status: 500 }
        )
      }

      console.log('[Webhook] Self-pickup order accepted:', orderId)

    } else if (fulfillmentType === 'scheduled') {
      // Scheduled delivery: queue for later dispatch by cron
      const { error: queueError } = await supabase
        .from('orders')
        .update({
          dispatch_status: 'queued',
        })
        .eq('id', orderId)

      if (queueError) {
        console.error('[Webhook] Failed to queue scheduled order:', orderId, queueError)
        return NextResponse.json(
          { success: false, error: 'Failed to queue scheduled order' },
          { status: 500 }
        )
      }

      console.log('[Webhook] Scheduled delivery queued:', orderId)

    } else {
      // ASAP delivery: dispatch immediately
      if (order.delivery_address_json) {
        try {
          const lalamoveOrder = await triggerLalamoveDelivery(
            orderId,
            order.delivery_address_json as Record<string, unknown>
          )
          if (lalamoveOrder?.orderId) {
            await supabase
              .from('orders')
              .update({
                lalamove_order_id: lalamoveOrder.orderId,
                lalamove_status: lalamoveOrder.status,
                dispatch_status: 'submitted',
              })
              .eq('id', orderId)
            console.log('[Webhook] Lalamove order placed:', lalamoveOrder.orderId)
          }
        } catch (lalamoveError) {
          console.error('[Webhook] Lalamove delivery failed:', lalamoveError)
          await supabase
            .from('orders')
            .update({ dispatch_status: 'failed' })
            .eq('id', orderId)
          console.log('[Webhook] Order marked as paid but delivery booking failed')
        }
      } else {
        console.warn('[Webhook] No delivery address on order:', orderId)
        await supabase
          .from('orders')
          .update({ dispatch_status: 'failed' })
          .eq('id', orderId)
      }
    }

    console.log('[Webhook] Order processed successfully:', orderId)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
