import { createServerClient } from '@supabase/ssr'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { mapV3StatusToDispatch, mapDispatchToOrderStatus, isValidStatusTransition } from '@/lib/lalamove/status-mapper'
import type { ShipmentDispatchStatus } from '@/lib/lalamove/types'

// Lalamove webhook event handlers extracted from route.ts so they can be unit
// tested in isolation. Next.js 16 enforces a strict route export allowlist
// (GET/POST/etc.), so any helper that needs to be imported by tests must live
// outside route.ts.

function sanitizeForLog(value: string): string {
  return value.replace(/\n|\r/g, '')
}

export async function handleStatusChange(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  data: Record<string, unknown>
) {
  const orderData = (data as any)?.order as Record<string, unknown> | undefined
  const newV3Status = (orderData?.status as string) || (data.status as string)
  if (!newV3Status) return

  const newDispatchStatus = mapV3StatusToDispatch(newV3Status as never)
  const currentStatus = shipment.dispatch_status as ShipmentDispatchStatus

  if (!isValidStatusTransition(currentStatus, newDispatchStatus)) {
    console.warn(
      `[Lalamove Webhook] Invalid transition: ${currentStatus} -> ${newDispatchStatus}, skipping`
    )
    return
  }

  // A driver-rejection revert: an active dispatch (driver_assigned/in_transit)
  // returns to ASSIGNING_DRIVER. Lalamove may also re-fire ASSIGNING_DRIVER
  // from manual_review when the previous assignment was rejected past the
  // retry cap. orders.status stays untouched so a picked_up food order stays
  // picked_up while Lalamove searches for a replacement driver.
  const isDriverRejectionRevert =
    newDispatchStatus === 'driver_pending' &&
    (currentStatus === 'driver_assigned' ||
      currentStatus === 'in_transit' ||
      currentStatus === 'manual_review')

  // Terminal failure paths from Lalamove:
  //   REJECTED  → manual_review (rejection retry cap reached)
  //   EXPIRED   → failed       (no driver assigned within the expiry window)
  // Both clear stale driver fields and emit a dedicated audit event.
  const isTerminalFailure =
    newDispatchStatus === 'manual_review' || newDispatchStatus === 'failed'

  const clearDriverFields = isDriverRejectionRevert || isTerminalFailure

  const now = new Date().toISOString()
  const updateData: Record<string, unknown> = {
    dispatch_status: newDispatchStatus,
    raw_webhook_payload: data,
  }

  if (newDispatchStatus === 'delivered') updateData.completed_at = now
  if (newDispatchStatus === 'cancelled') updateData.cancelled_at = now

  if (clearDriverFields) {
    updateData.driver_name = null
    updateData.driver_phone = null
    updateData.driver_plate = null
    updateData.driver_photo_url = null
    updateData.driver_latitude = null
    updateData.driver_longitude = null
    updateData.driver_location_updated_at = null
  }

  const priorDriver = clearDriverFields
    ? {
        driver_name: shipment.driver_name ?? null,
        driver_phone: shipment.driver_phone ?? null,
        driver_plate: shipment.driver_plate ?? null,
        lalamove_order_id: lalamoveOrderId,
      }
    : null

  await supabase
    .from('lalamove_shipments')
    .update(updateData)
    .eq('id', shipment.id)

  const { data: currentOrder } = await supabase
    .from('orders')
    .select('status')
    .eq('id', shipment.order_id)
    .single()

  if (currentOrder?.status === 'cancelled') {
    console.warn(`[Lalamove Webhook] Order ${shipment.order_id} is cancelled, skipping status update`)
    return
  }

  // Only forward lifecycle transitions touch orders.status; revert and
  // terminal-failure paths leave it alone.
  const orderStatus = mapDispatchToOrderStatus(newDispatchStatus)
  const ordersPatch: Record<string, unknown> = {
    lalamove_status: newV3Status,
    dispatch_status: newDispatchStatus,
  }
  if (orderStatus) {
    ordersPatch.status = orderStatus
  }
  if (clearDriverFields) {
    ordersPatch.driver_name = null
    ordersPatch.driver_phone = null
    ordersPatch.driver_plate_number = null
  }
  await supabase
    .from('orders')
    .update(ordersPatch)
    .eq('id', shipment.order_id)

  // Revert and terminal failures get dedicated event types so the admin
  // order_events history reads as a clear audit trail.
  let eventType: string
  let oldValue: Record<string, unknown> = { dispatch_status: currentStatus }
  let newValue: Record<string, unknown> = {
    dispatch_status: newDispatchStatus,
    lalamove_status: newV3Status,
  }

  if (isDriverRejectionRevert) {
    eventType = 'driver_rejected'
    oldValue = { ...oldValue, ...(priorDriver ?? {}) }
  } else if (newDispatchStatus === 'manual_review') {
    eventType = 'delivery_rejected'
    newValue = { ...newValue, reason: 'rejection_limit' }
  } else if (newDispatchStatus === 'failed') {
    eventType = 'delivery_expired'
    newValue = { ...newValue, reason: 'expired' }
  } else {
    eventType = `shipment_${newDispatchStatus}`
  }

  await supabase.from('order_events').insert({
    order_id: shipment.order_id,
    event_type: eventType,
    old_value: oldValue,
    new_value: newValue,
  })

  try {
    const { sendShippingNotification } = await import('@/lib/notifications/shipping-emails')
    await sendShippingNotification(supabase, shipment.order_id as string, newDispatchStatus)
  } catch {
    // Email notification failure is non-fatal
  }

  if (orderStatus) {
    try {
      const { sendOrderStatusNotification } = await import('@/lib/bots/order-notifications')
      await sendOrderStatusNotification(shipment.order_id as string, orderStatus)
    } catch {
      // Notification failure must not break the webhook
    }
  }

  // Lalamove v3 bundles driver assignment into ORDER_STATUS_CHANGED rather
  // than sending a separate DRIVER_ASSIGNED event.
  if (newV3Status === 'ON_GOING') {
    const driverId = orderData?.driverId as string
    if (driverId) {
      await updateDriverDetails(supabase, shipment, lalamoveOrderId, driverId)
    }
  }

  console.log(`[Lalamove Webhook] Status: ${currentStatus} -> ${newDispatchStatus} for order ${shipment.order_id}`)
}

export async function updateDriverDetails(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  driverId: string
) {
  const lalamove = createLalamoveClient()
  const driver = await lalamove.getDriverDetails(lalamoveOrderId, driverId)

  await supabase
    .from('lalamove_shipments')
    .update({
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
      driver_name: driver.name,
      driver_phone: driver.phone,
      driver_plate_number: driver.plateNumber,
    })
    .eq('id', shipment.order_id)

  // Advance dispatch_status only if the shipment hasn't already progressed.
  // The .in() filter is evaluated by Postgres so concurrent webhooks race safely.
  await supabase
    .from('lalamove_shipments')
    .update({ dispatch_status: 'driver_assigned' })
    .eq('id', shipment.id)
    .in('dispatch_status', ['quoted', 'driver_pending', 'manual_review'])

  await supabase
    .from('orders')
    .update({ lalamove_status: 'ON_GOING', dispatch_status: 'driver_assigned' })
    .eq('id', shipment.order_id)
    .in('dispatch_status', [
      'not_ready',
      'queued',
      'submitted',
      'quoted',
      'driver_pending',
      'manual_review',
    ])

  return driver
}

export async function handleDriverAssigned(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  data: Record<string, unknown>
) {
  // Lalamove v3 nests driverId under data.order.driverId, not data.driverId
  const orderPayload = (data as any)?.order as Record<string, unknown> | undefined
  const driverId = (orderPayload?.driverId as string) || data.driverId as string || (data.driver as Record<string, unknown>)?.id as string

  if (!driverId) {
    console.warn('[Lalamove Webhook] DRIVER_ASSIGNED without driverId')
    return
  }

  try {
    const driver = await updateDriverDetails(supabase, shipment, lalamoveOrderId, driverId)

    await supabase.from('order_events').insert({
      order_id: shipment.order_id,
      event_type: 'driver_assigned',
      new_value: {
        driver_name: driver.name,
        driver_phone: driver.phone,
        driver_plate: driver.plateNumber,
      },
    })

    try {
      const { sendShippingNotification } = await import('@/lib/notifications/shipping-emails')
      await sendShippingNotification(supabase, shipment.order_id as string, 'driver_assigned')
    } catch {}

    console.log(`[Lalamove Webhook] Driver assigned: ${driver.name} for order ${shipment.order_id}`)
  } catch (error) {
    // Driver details may return 403 (permissions) or 404 (driver not yet
    // indexed on Lalamove's side). Both self-heal on the next webhook.
    const errorMessage = error instanceof Error ? error.message : ''
    if (!errorMessage.includes('403') && !errorMessage.includes('404')) {
      throw error
    }

    await supabase
      .from('lalamove_shipments')
      .update({ dispatch_status: 'driver_assigned' })
      .eq('id', shipment.id)
      .in('dispatch_status', ['quoted', 'driver_pending', 'manual_review'])

    await supabase
      .from('orders')
      .update({ dispatch_status: 'driver_assigned' })
      .eq('id', shipment.order_id)
      .in('dispatch_status', [
        'not_ready',
        'queued',
        'submitted',
        'quoted',
        'driver_pending',
        'manual_review',
      ])

    console.log(`[Lalamove Webhook] Driver assigned (details unavailable yet) for order ${shipment.order_id}`)
  }
}

export async function handleAmountChanged(
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

export async function handleOrderReplaced(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  data: Record<string, unknown>
) {
  const orderPayload = (data as any)?.order as Record<string, unknown> | undefined
  const newDriverId = (orderPayload?.driverId as string) || data.driverId as string

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

export async function handleOrderCreated(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  data: Record<string, unknown>
) {
  const orderData = (data as any)?.order as Record<string, unknown> | undefined
  if (!orderData) {
    console.warn('[Lalamove Webhook] ORDER_CREATED without order data')
    return
  }

  const shareLink = orderData.shareLink as string | undefined

  const updateData: Record<string, unknown> = {
    lalamove_order_id: lalamoveOrderId,
    dispatch_status: 'driver_pending',
  }
  if (shareLink) {
    updateData.tracking_url = shareLink
  }

  await supabase
    .from('lalamove_shipments')
    .update(updateData)
    .eq('id', shipment.id)

  await supabase
    .from('orders')
    .update({
      lalamove_status: orderData.status as string,
      dispatch_status: 'driver_pending',
    })
    .eq('id', shipment.order_id)

  await supabase.from('order_events').insert({
    order_id: shipment.order_id,
    event_type: 'shipment_created',
    new_value: {
      lalamove_order_id: lalamoveOrderId,
      tracking_url: shareLink,
      dispatch_status: 'driver_pending',
    },
  })

  console.log(
    `[Lalamove Webhook] Order created: ${sanitizeForLog(lalamoveOrderId)} for order ${shipment.order_id}`
  )
}
