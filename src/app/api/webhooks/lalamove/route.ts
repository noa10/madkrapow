import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

interface LalamoveWebhookPayload {
  orderId: string
  status: string
  driver?: {
    name: string
    phone: string
    vehicleType: string
    licensePlate: string
  }
  eta?: string
}

interface LalamoveWebhookResponse {
  success: true
}

interface LalamoveWebhookError {
  success: false
  error: string
}

type WebhookResult = LalamoveWebhookResponse | LalamoveWebhookError

const LALAMOVE_STATUS_MAP: Record<string, string> = {
  PENDING: 'preparing',
  ASSIGNED: 'preparing',
  PICKED_UP: 'picked_up',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  CANCELLED_BY_DRIVER: 'cancelled',
  CANCELLED_BY_USER: 'cancelled',
}

function mapLalamoveStatus(lalamoveStatus: string): string {
  return LALAMOVE_STATUS_MAP[lalamoveStatus] || 'preparing'
}

async function updateOrderStatus(
  supabase: ReturnType<typeof createServerClient>,
  orderId: string,
  status: string,
  lalamoveStatus?: string,
  driverInfo?: {
    name?: string
    phone?: string
    vehicleType?: string
    licensePlate?: string
  }
) {
  const { data: existingOrder, error: fetchError } = await supabase
    .from('orders')
    .select('driver_name, driver_phone, driver_plate_number')
    .eq('lalamove_order_id', orderId)
    .single()

  if (fetchError || !existingOrder) {
    console.error('[Lalamove Webhook] Failed to fetch order for driver update:', fetchError)
    throw new Error(`Order not found: ${fetchError?.message || 'Unknown error'}`)
  }

  const updateData: Record<string, unknown> = {
    status,
    lalamove_status: lalamoveStatus,
  }

  // Only update driver fields if they don't already exist (idempotent)
  if (driverInfo) {
    if (driverInfo.name && !existingOrder.driver_name) {
      updateData.driver_name = driverInfo.name
    }
    if (driverInfo.phone && !existingOrder.driver_phone) {
      updateData.driver_phone = driverInfo.phone
    }
    if (driverInfo.licensePlate && !existingOrder.driver_plate_number) {
      updateData.driver_plate_number = driverInfo.licensePlate
    }
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updateData)
    .eq('lalamove_order_id', orderId)
    .select()
    .single()

  if (error) {
    console.error('[Lalamove Webhook] Failed to update order status:', error)
    throw new Error(`Failed to update order status: ${error.message}`)
  }

  return data
}

export async function POST(req: NextRequest): Promise<NextResponse<WebhookResult>> {
  try {
    const body = await req.text()
    console.log('[Lalamove Webhook] Received webhook:', body)

    let payload: LalamoveWebhookPayload
    try {
      payload = JSON.parse(body)
    } catch {
      console.error('[Lalamove Webhook] Invalid JSON payload')
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    const { orderId, status: lalamoveStatus } = payload

    if (!orderId || !lalamoveStatus) {
      console.error('[Lalamove Webhook] Missing required fields: orderId or status')
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    console.log('[Lalamove Webhook] Order ID:', orderId, 'Status:', lalamoveStatus)

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

    const { data: existingOrder, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, lalamove_status')
      .eq('lalamove_order_id', orderId)
      .single()

    if (fetchError || !existingOrder) {
      console.error('[Lalamove Webhook] Order not found for Lalamove order:', orderId)
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      )
    }

    const mappedStatus = mapLalamoveStatus(lalamoveStatus)

    if (existingOrder.lalamove_status === lalamoveStatus) {
      console.log('[Lalamove Webhook] Status unchanged, skipping update:', lalamoveStatus)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    await updateOrderStatus(supabase, orderId, mappedStatus, lalamoveStatus, payload.driver)

    console.log('[Lalamove Webhook] Order status updated:', orderId, '->', mappedStatus)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[Lalamove Webhook] Error processing webhook:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}