import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { verifyWebhookSignature } from '@/lib/lalamove/auth'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { mapV3StatusToDispatch, mapDispatchToOrderStatus, isValidStatusTransition } from '@/lib/lalamove/status-mapper'
import type { ShipmentDispatchStatus } from '@/lib/lalamove/types'

function sanitizeForLog(value: string): string {
  return value.replace(/\n|\r/g, '');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.text()
    const response = NextResponse.json({ success: true }, { status: 200 })

    // Verify webhook signature
    const signature = req.headers.get('x-lalamove-signature')
    const secret = process.env.LALAMOVE_API_SECRET

    if (!secret) {
      console.error('[Lalamove Webhook] LALAMOVE_API_SECRET not configured')
      return NextResponse.json({ success: false, error: 'Webhook secret not configured' }, { status: 500 })
    }

    if (!signature) {
      console.error('[Lalamove Webhook] Missing x-lalamove-signature header')
      return NextResponse.json({ success: false, error: 'Missing signature header' }, { status: 401 })
    }

    try {
      verifyWebhookSignature(body, signature, secret)
    } catch {
      console.error('[Lalamove Webhook] Invalid signature')
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 })
    }

    // Parse payload
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(body)
    } catch {
      console.error('[Lalamove Webhook] Invalid JSON')
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const lalamoveOrderId = payload.orderId as string
    const eventType = payload.type as string
    const eventTimestamp = payload.timestamp as string
    const eventData = payload.data as Record<string, unknown> || {}

    if (!lalamoveOrderId || !eventType) {
      console.error('[Lalamove Webhook] Missing required fields')
      return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )

    // Idempotency: check if event already processed
    const { data: existingEvent } = await supabase
      .from('lalamove_webhook_events')
      .select('id, processed')
      .eq('lalamove_order_id', lalamoveOrderId)
      .eq('event_type', eventType)
      .eq('created_at', eventTimestamp)
      .maybeSingle()

    if (existingEvent?.processed) {
      return response
    }

    // Log raw payload
    await supabase.from('lalamove_webhook_events').insert({
      lalamove_order_id: lalamoveOrderId,
      event_type: eventType,
      event_status: (eventData.status as string) || null,
      raw_payload: payload,
      signature,
    })

    // Find shipment
    const { data: shipment } = await supabase
      .from('lalamove_shipments')
      .select('*')
      .eq('lalamove_order_id', lalamoveOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!shipment) {
      console.warn('[Lalamove Webhook] No shipment found for order:', sanitizeForLog(lalamoveOrderId))
      // Still mark event as processed
      await supabase
        .from('lalamove_webhook_events')
        .update({ processed: true, processing_error: 'Shipment not found' })
        .eq('lalamove_order_id', lalamoveOrderId)
        .eq('event_type', eventType)
      return response
    }

    // Route by event type
    try {
      switch (eventType) {
        case 'ORDER_STATUS_CHANGED':
          await handleStatusChange(supabase, shipment, lalamoveOrderId, eventData)
          break

        case 'DRIVER_ASSIGNED':
          await handleDriverAssigned(supabase, shipment, lalamoveOrderId, eventData)
          break

        case 'ORDER_AMOUNT_CHANGED':
          await handleAmountChanged(supabase, shipment, eventData)
          break

        case 'ORDER_REPLACED':
          await handleOrderReplaced(supabase, shipment, lalamoveOrderId, eventData)
          break

        default:
          console.log('[Lalamove Webhook] Unknown event type:', sanitizeForLog(eventType))
      }

      // Mark event as processed
      await supabase
        .from('lalamove_webhook_events')
        .update({ processed: true })
        .eq('lalamove_order_id', lalamoveOrderId)
        .eq('event_type', eventType)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Lalamove Webhook] Processing error:', errorMessage)

      await supabase
        .from('lalamove_webhook_events')
        .update({ processing_error: errorMessage })
        .eq('lalamove_order_id', lalamoveOrderId)
        .eq('event_type', eventType)
    }

    return response
  } catch (error) {
    console.error('[Lalamove Webhook] Fatal error:', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}

async function handleStatusChange(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  data: Record<string, unknown>
) {
  const newV3Status = data.status as string
  if (!newV3Status) return

  const newDispatchStatus = mapV3StatusToDispatch(newV3Status as never)
  const currentStatus = shipment.dispatch_status as ShipmentDispatchStatus

  // Validate status transition (prevents out-of-order webhooks)
  if (!isValidStatusTransition(currentStatus, newDispatchStatus)) {
    console.warn(
      `[Lalamove Webhook] Invalid transition: ${currentStatus} -> ${newDispatchStatus}, skipping`
    )
    return
  }

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    dispatch_status: newDispatchStatus,
    raw_webhook_payload: data,
  }

  // Set timestamps
  if (newDispatchStatus === 'delivered') updateData.completed_at = now
  if (newDispatchStatus === 'cancelled') updateData.cancelled_at = now

  // Update shipment
  await supabase
    .from('lalamove_shipments')
    .update(updateData)
    .eq('id', shipment.id)

  // Guard against overwriting cancelled orders
  const { data: currentOrder } = await supabase
    .from('orders')
    .select('status')
    .eq('id', shipment.order_id)
    .single()

  if (currentOrder?.status === 'cancelled') {
    console.warn(`[Lalamove Webhook] Order ${shipment.order_id} is cancelled, skipping status update`)
    return
  }

  // Update orders table if lifecycle truly changes
  const orderStatus = mapDispatchToOrderStatus(newDispatchStatus)
  if (orderStatus) {
    await supabase
      .from('orders')
      .update({
        status: orderStatus,
        lalamove_status: newV3Status,
        dispatch_status: newDispatchStatus,
      })
      .eq('id', shipment.order_id)
  } else {
    await supabase
      .from('orders')
      .update({
        lalamove_status: newV3Status,
        dispatch_status: newDispatchStatus,
      })
      .eq('id', shipment.order_id)
  }

  // Log event
  await supabase.from('order_events').insert({
    order_id: shipment.order_id,
    event_type: `shipment_${newDispatchStatus}`,
    old_value: { dispatch_status: currentStatus },
    new_value: { dispatch_status: newDispatchStatus, lalamove_status: newV3Status },
  })

  // Send email notifications for key status changes
  try {
    const { sendShippingNotification } = await import('@/lib/notifications/shipping-emails')
    await sendShippingNotification(supabase, shipment.order_id as string, newDispatchStatus)
  } catch {
    // Email notification failure is non-fatal
  }

  console.log(`[Lalamove Webhook] Status: ${currentStatus} -> ${newDispatchStatus} for order ${shipment.order_id}`)
}

async function handleDriverAssigned(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  data: Record<string, unknown>
) {
  // Fetch driver details from Lalamove
  const driverId = data.driverId as string || (data.driver as Record<string, unknown>)?.id as string

  if (!driverId) {
    console.warn('[Lalamove Webhook] DRIVER_ASSIGNED without driverId')
    return
  }

  try {
    const lalamove = createLalamoveClient()
    const driver = await lalamove.getDriverDetails(lalamoveOrderId, driverId)

    await supabase
      .from('lalamove_shipments')
      .update({
        dispatch_status: 'driver_assigned',
        driver_name: driver.name,
        driver_phone: driver.phone,
        driver_plate: driver.plateNumber,
        driver_photo_url: driver.photo || null,
        driver_latitude: driver.coordinates ? parseFloat(driver.coordinates.lat) : null,
        driver_longitude: driver.coordinates ? parseFloat(driver.coordinates.lng) : null,
        driver_location_updated_at: driver.coordinates?.updatedAt || null,
      })
      .eq('id', shipment.id)

    await supabase
      .from('orders')
      .update({
        lalamove_status: 'ON_GOING',
        dispatch_status: 'driver_assigned',
        driver_name: driver.name,
        driver_phone: driver.phone,
        driver_plate_number: driver.plateNumber,
      })
      .eq('id', shipment.order_id)

    await supabase.from('order_events').insert({
      order_id: shipment.order_id,
      event_type: 'driver_assigned',
      new_value: {
        driver_name: driver.name,
        driver_phone: driver.phone,
        driver_plate: driver.plateNumber,
      },
    })

    // Send driver assigned email
    try {
      const { sendShippingNotification } = await import('@/lib/notifications/shipping-emails')
      await sendShippingNotification(supabase, shipment.order_id as string, 'driver_assigned')
    } catch {}

    console.log(`[Lalamove Webhook] Driver assigned: ${driver.name} for order ${shipment.order_id}`)
  } catch (error) {
    // Driver details may return 403 - update status anyway
    const errorMessage = error instanceof Error ? error.message : ''
    if (!errorMessage.includes('403')) {
      throw error
    }

    await supabase
      .from('lalamove_shipments')
      .update({ dispatch_status: 'driver_assigned' })
      .eq('id', shipment.id)

    await supabase
      .from('orders')
      .update({ dispatch_status: 'driver_assigned' })
      .eq('id', shipment.order_id)

    console.log(`[Lalamove Webhook] Driver assigned (details unavailable yet) for order ${shipment.order_id}`)
  }
}

async function handleAmountChanged(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  data: Record<string, unknown>
) {
  const priceBreakdown = data.priceBreakdown as Record<string, string> | undefined
  if (!priceBreakdown?.total) return

  const newFeeCents = Math.round(parseFloat(priceBreakdown.total) * 100)
  const originalFeeCents = shipment.quoted_fee_cents as number

  await supabase
    .from('lalamove_shipments')
    .update({ actual_fee_cents: newFeeCents })
    .eq('id', shipment.id)

  if (newFeeCents !== originalFeeCents) {
    await supabase.from('order_events').insert({
      order_id: shipment.order_id,
      event_type: 'delivery_fee_changed',
      old_value: { fee_cents: originalFeeCents },
      new_value: { fee_cents: newFeeCents, variance: newFeeCents - originalFeeCents },
    })

    console.log(
      `[Lalamove Webhook] Fee changed: ${originalFeeCents} -> ${newFeeCents} for order ${shipment.order_id}`
    )
  }
}

async function handleOrderReplaced(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  data: Record<string, unknown>
) {
  // Update with new driver info from replacement
  const newDriverId = data.driverId as string

  if (newDriverId) {
    try {
      const lalamove = createLalamoveClient()
      const driver = await lalamove.getDriverDetails(lalamoveOrderId, newDriverId)

      await supabase
        .from('lalamove_shipments')
        .update({
          driver_name: driver.name,
          driver_phone: driver.phone,
          driver_plate: driver.plateNumber,
          driver_photo_url: driver.photo || null,
          driver_latitude: driver.coordinates ? parseFloat(driver.coordinates.lat) : null,
          driver_longitude: driver.coordinates ? parseFloat(driver.coordinates.lng) : null,
        })
        .eq('id', shipment.id)

      await supabase
        .from('orders')
        .update({
          driver_name: driver.name,
          driver_phone: driver.phone,
          driver_plate_number: driver.plateNumber,
        })
        .eq('id', shipment.order_id)
    } catch {}
  }

  await supabase.from('order_events').insert({
    order_id: shipment.order_id,
    event_type: 'driver_replaced',
    new_value: { new_driver_id: newDriverId },
  })

  console.log(`[Lalamove Webhook] Order replaced for order ${shipment.order_id}`)
}
