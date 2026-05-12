import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import crypto from 'crypto'
import { verifyWebhookSignature } from '@/lib/lalamove/auth'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { mapV3StatusToDispatch, mapDispatchToOrderStatus, isValidStatusTransition } from '@/lib/lalamove/status-mapper'
import type { ShipmentDispatchStatus } from '@/lib/lalamove/types'

function sanitizeForLog(value: string): string {
  return value.replace(/\n|\r/g, '')
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ success: true }, { status: 200 })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Diagnostic trace: single correlation id per request so we can follow a
  // webhook across every log line in Vercel. Log the very first thing before
  // any parsing, env reads, or DB work so we can prove HTTP arrives even if
  // we blow up later.
  const trace = crypto.randomUUID().slice(0, 8)
  const log = (stage: string, extra?: Record<string, unknown>) =>
    console.log(`[Lalamove Webhook] [${trace}] ${stage}`, extra ?? '')
  const logErr = (stage: string, extra?: Record<string, unknown>) =>
    console.error(`[Lalamove Webhook] [${trace}] ${stage}`, extra ?? '')

  log('received', {
    contentType: req.headers.get('content-type'),
    hasLalamoveSigHeader: !!req.headers.get('x-lalamove-signature'),
  })

  try {
    const body = await req.text()
    log('body-read', { bodyLength: body.length })
    const response = NextResponse.json({ success: true }, { status: 200 })

    // Parse payload
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(body)
    } catch {
      logErr('invalid-json', { bodyPreview: body.slice(0, 120) })
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    // Lalamove v3 webhook payload uses `eventType`, `eventId`, and nests order data under `data.order`.
    // Signature is sent in the JSON body, not as a header.
    const eventType = payload.eventType as string || payload.type as string
    const eventId = payload.eventId as string | undefined
    const eventTimestampRaw = payload.timestamp
    const signature = req.headers.get('x-lalamove-signature') || (payload.signature as string)
    const secret = process.env.LALAMOVE_API_SECRET

    log('parsed', {
      eventType: eventType ?? null,
      eventId: eventId ?? null,
      hasSignature: !!signature,
      hasSecret: !!secret,
      secretLen: secret ? secret.length : 0,
      timestampType: typeof eventTimestampRaw,
    })

    // Lalamove sends a signature-less POST probe (empty body `{}`) during webhook
    // URL validation in their portal. Return 200 so the URL is accepted.
    const trimmedBody = body.trim()
    if (!signature && (trimmedBody === '' || trimmedBody === '{}')) {
      log('validation-ping')
      return response
    }

    if (!secret) {
      logErr('missing-secret')
      return NextResponse.json({ success: false, error: 'Webhook secret not configured' }, { status: 500 })
    }

    // Signature verification. Always call the verifier (unconditional),
    // so permission to process the webhook does not branch on user-controlled
    // state. An unknown or invalid signature throws or returns false and is
    // rejected with 401.
    let verified = false
    let verifyError: string | null = null
    try {
      verified = verifyWebhookSignature(body, signature ?? '', secret)
    } catch (e) {
      verified = false
      verifyError = e instanceof Error ? e.message : String(e)
    }
    if (!verified) {
      logErr('signature-failed', {
        signaturePreview: signature ? signature.slice(0, 12) + '…' : null,
        verifyError,
      })
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 })
    }
    log('signature-verified')

    if (!eventType) {
      logErr('missing-event-type')
      return NextResponse.json({ success: false, error: 'Missing eventType' }, { status: 400 })
    }

    // Lalamove sends timestamp as Unix seconds (number), not ISO string
    let createdAt: string
    if (typeof eventTimestampRaw === 'number') {
      createdAt = new Date(eventTimestampRaw * 1000).toISOString()
    } else if (typeof eventTimestampRaw === 'string') {
      createdAt = eventTimestampRaw
    } else {
      createdAt = new Date().toISOString()
    }

    const eventData = payload.data as Record<string, unknown> || {}

    // Order ID is nested under data.order.orderId in Lalamove v3 webhooks
    const orderData = (eventData as any)?.order as Record<string, unknown> | undefined
    const lalamoveOrderId = orderData?.orderId as string || payload.orderId as string

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      logErr('missing-supabase-env', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
      })
      return NextResponse.json(
        { success: false, error: 'Supabase env not configured' },
        { status: 500 }
      )
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseServiceKey,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )

    // Log raw payload first so we always have a record to reference
    const insertData: Record<string, unknown> = {
      event_type: eventType,
      event_status: (orderData?.status as string) || (eventData.status as string) || null,
      raw_payload: payload,
      signature,
      created_at: createdAt,
    }
    if (lalamoveOrderId) {
      insertData.lalamove_order_id = lalamoveOrderId
    }

    const { data: insertedEvent, error: insertError } = await supabase
      .from('lalamove_webhook_events')
      .insert(insertData)
      .select('id')
      .single()

    if (insertError) {
      logErr('event-insert-failed', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
      })
      return NextResponse.json(
        { success: false, error: 'DB insert failed' },
        { status: 500 }
      )
    }

    const eventRowId = insertedEvent?.id as string | undefined
    log('event-inserted', { eventRowId: eventRowId ?? null, lalamoveOrderId: lalamoveOrderId ?? null })

    // Events without an order ID (e.g., WALLET_BALANCE_CHANGED) don't need shipment lookup
    if (!lalamoveOrderId) {
      if (eventType === 'WALLET_BALANCE_CHANGED') {
        log('ignoring-wallet-balance')
      } else {
        log('event-without-order-id', { eventType: sanitizeForLog(eventType) })
      }
      if (eventRowId) {
        await supabase
          .from('lalamove_webhook_events')
          .update({ processed: true })
          .eq('id', eventRowId)
      }
      return response
    }

    // Find shipment by Lalamove order ID
    let shipment: Record<string, unknown> | null = null
    const { data: shipmentByLalamoveId } = await supabase
      .from('lalamove_shipments')
      .select('*')
      .eq('lalamove_order_id', lalamoveOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    shipment = shipmentByLalamoveId

    // Fallback: Lalamove occasionally fires ORDER_STATUS_CHANGED before
    // ORDER_CREATED (or before POST /orders commits lalamove_order_id).
    // Match the draft shipment via metadata.orderId for any event type, then
    // backfill lalamove_order_id so later webhooks hit the primary index.
    if (!shipment && orderData?.metadata) {
      const metadata = orderData.metadata as Record<string, unknown>
      const internalOrderId = metadata?.orderId as string | undefined
      if (internalOrderId) {
        const { data: shipmentByMeta } = await supabase
          .from('lalamove_shipments')
          .select('*')
          .eq('order_id', internalOrderId)
          .is('lalamove_order_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (shipmentByMeta) {
          if (eventType !== 'ORDER_CREATED') {
            await supabase
              .from('lalamove_shipments')
              .update({ lalamove_order_id: lalamoveOrderId })
              .eq('id', shipmentByMeta.id)
              .is('lalamove_order_id', null)
            shipmentByMeta.lalamove_order_id = lalamoveOrderId
          }
          shipment = shipmentByMeta
        }
      }
    }

    if (!shipment) {
      logErr('shipment-not-found', { lalamoveOrderId: sanitizeForLog(lalamoveOrderId) })
      if (eventRowId) {
        await supabase
          .from('lalamove_webhook_events')
          .update({ processed: true, processing_error: 'Shipment not found' })
          .eq('id', eventRowId)
      }
      return response
    }

    log('shipment-found', { shipmentId: shipment.id as string, dispatchStatus: shipment.dispatch_status as string })

    // Route by event type
    try {
      switch (eventType) {
        case 'ORDER_STATUS_CHANGED':
          await handleStatusChange(supabase, shipment, lalamoveOrderId, eventData)
          break

        case 'ORDER_CREATED':
          await handleOrderCreated(supabase, shipment, lalamoveOrderId, eventData)
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
          log('unknown-event-type', { eventType: sanitizeForLog(eventType) })
      }

      if (eventRowId) {
        await supabase
          .from('lalamove_webhook_events')
          .update({ processed: true })
          .eq('id', eventRowId)
      }
      log('done')

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      logErr('handler-error', { message: errorMessage, stack: errorStack })

      if (eventRowId) {
        await supabase
          .from('lalamove_webhook_events')
          .update({ processing_error: errorMessage })
          .eq('id', eventRowId)
      }
    }

    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    logErr('fatal', { message, stack })
    return NextResponse.json(
      { success: false, error: 'Internal error', trace },
      { status: 500 }
    )
  }
}

async function handleStatusChange(
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

  // Notify bot customers of delivery status changes (best-effort, non-blocking)
  if (orderStatus) {
    try {
      const { sendOrderStatusNotification } = await import('@/lib/bots/order-notifications')
      await sendOrderStatusNotification(shipment.order_id as string, orderStatus)
    } catch {
      // Notification failure must not break the webhook
    }
  }

  // If driver is assigned via ON_GOING status change, fetch driver details
  // (Lalamove v3 bundles driver assignment into ORDER_STATUS_CHANGED rather than
  // sending a separate DRIVER_ASSIGNED event)
  if (newV3Status === 'ON_GOING') {
    const driverId = orderData?.driverId as string
    if (driverId) {
      await updateDriverDetails(supabase, shipment, lalamoveOrderId, driverId)
    }
  }

  console.log(`[Lalamove Webhook] Status: ${currentStatus} -> ${newDispatchStatus} for order ${shipment.order_id}`)
}

async function updateDriverDetails(
  supabase: ReturnType<typeof createServerClient>,
  shipment: Record<string, unknown>,
  lalamoveOrderId: string,
  driverId: string
) {
  const lalamove = createLalamoveClient()
  const driver = await lalamove.getDriverDetails(lalamoveOrderId, driverId)

  // Always refresh driver info — phone/plate/location can change mid-delivery.
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
  // Prevents late DRIVER_ASSIGNED webhooks from regressing in_transit/delivered
  // rows. The .in() filter is evaluated by Postgres, so concurrent webhooks
  // race safely.
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

async function handleDriverAssigned(
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

    // Send driver assigned email
    try {
      const { sendShippingNotification } = await import('@/lib/notifications/shipping-emails')
      await sendShippingNotification(supabase, shipment.order_id as string, 'driver_assigned')
    } catch {}

    console.log(`[Lalamove Webhook] Driver assigned: ${driver.name} for order ${shipment.order_id}`)
  } catch (error) {
    // Driver details may return 403 (permissions) or 404 (driver not yet
    // indexed on Lalamove's side). Both self-heal on the next webhook, so
    // log and advance dispatch_status only if the shipment hasn't progressed.
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

async function handleOrderCreated(
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

  console.log(`[Lalamove Webhook] Order created: ${lalamoveOrderId} for order ${shipment.order_id}`)
}
