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
    phone: env.STORE_PHONE,
  }
}

async function updateOrderStatus(supabase: ReturnType<typeof createServerClient>, orderId: string, status: string) {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)
    .select()
    .single()

  if (error) {
    console.error('[Webhook] Failed to update order status:', error)
    throw new Error(`Failed to update order status: ${error.message}`)
  }

  return data
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
          city: 'Kuala Lumpur',
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
        {
          success: false,
          error: 'Missing stripe-signature header',
        },
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
        {
          success: false,
          error: 'Invalid signature',
        },
        { status: 400 }
      )
    }

    if (event.type !== 'checkout.session.completed') {
      console.log('[Webhook] Ignoring event type:', event.type)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const session = event.data.object as { metadata?: Record<string, string> }
    const orderId = session.metadata?.order_id

    if (!orderId) {
      console.error('[Webhook] No order_id in session metadata')
      return NextResponse.json(
        {
          success: false,
          error: 'Missing order_id in metadata',
        },
        { status: 400 }
      )
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
        {
          success: false,
          error: 'Order not found',
        },
        { status: 404 }
      )
    }

    if (order.status === 'paid' || order.status === 'confirmed') {
      console.log('[Webhook] Order already processed:', orderId)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    await updateOrderStatus(supabase, orderId, 'paid')

    if (order.delivery_address) {
      try {
        const lalamoveOrder = await triggerLalamoveDelivery(orderId, order.delivery_address as Record<string, unknown>)
        if (lalamoveOrder?.orderId) {
          await supabase
            .from('orders')
            .update({ 
              lalamove_order_id: lalamoveOrder.orderId,
              lalamove_status: lalamoveOrder.status 
            })
            .eq('id', orderId)
          console.log('[Webhook] Order updated with Lalamove order ID:', lalamoveOrder.orderId)
        }
      } catch (lalamoveError) {
        console.error('[Webhook] Lalamove delivery failed:', lalamoveError)
        console.log('[Webhook] Order marked as paid but delivery booking failed')
      }
    }

    console.log('[Webhook] Order processed successfully:', orderId)
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[Webhook] Error processing webhook:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}
