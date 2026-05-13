import { createLalamoveClient } from '@/lib/lalamove/client'
import { normalizeMalaysianPhone } from '@/lib/lalamove/phone'
import { buildLalamoveRemarks } from '@/lib/lalamove/remarks'
import { mapV3StatusToDispatch } from '@/lib/lalamove/status-mapper'
import { env } from '@/lib/validators/env'

type ServiceClient = ReturnType<typeof import('@supabase/ssr').createServerClient>

export interface FulfillmentResult {
  success: boolean
  lalamoveOrderId?: string
  shareLink?: string
  dispatchStatus: string
  feeCents?: number
  error?: string
}

/**
 * Resolve the full address string from an address object.
 */
function resolveAddress(address: Record<string, unknown>): string {
  if (address.address_line1) {
    return [
      address.address_line1,
      address.address_line2,
      address.city,
      address.state,
      address.postal_code,
    ].filter(Boolean).join(', ')
  }
  return (address.address as string) || ''
}

/**
 * Resolve the recipient name from an address object.
 */
function resolveName(address: Record<string, unknown>): string {
  return (address.full_name || address.fullName || 'Customer') as string
}

/**
 * Resolve the recipient phone in E.164 format.
 */
function resolvePhone(address: Record<string, unknown>): string {
  return normalizeMalaysianPhone((address.phone as string) || '+60000000000') || '+60000000000'
}

/**
 * Fulfill a delivery order by placing it with Lalamove v3.
 *
 * Handles:
 * - Getting a fresh quotation
 * - Placing the order
 * - Inserting/updating the lalamove_shipments record
 * - Updating the orders table
 * - Logging order_events
 *
 * @param supabase - Service client (bypasses RLS)
 * @param orderId - Order ID
 * @param options - Optional overrides for service type, schedule, re-quoting
 */
export async function fulfillDeliveryOrder(
  supabase: ServiceClient,
  orderId: string,
  options?: {
    serviceType?: string
    scheduleAt?: string
    requote?: boolean
  }
): Promise<FulfillmentResult> {
  // Fetch order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (orderError || !order) {
    return { success: false, dispatchStatus: 'failed', error: 'Order not found' }
  }

  const address = order.delivery_address_json as Record<string, unknown> | null
  if (!address) {
    return { success: false, dispatchStatus: 'failed', error: 'No delivery address' }
  }

  const serviceType = options?.serviceType || env.LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE || 'MOTORCYCLE'

  try {
    const lalamove = createLalamoveClient()

    const recipientName = resolveName(address)
    const recipientPhone = resolvePhone(address)
    const recipientAddress = resolveAddress(address)
    const recipientLat = address.latitude ? String(address.latitude) : String(env.STORE_LATITUDE)
    const recipientLng = address.longitude ? String(address.longitude) : String(env.STORE_LONGITUDE)

    // Step 1: Get quotation
    const quotation = await lalamove.getQuotation({
      serviceType,
      language: 'en_MY',
      stops: [
        {
          coordinates: { lat: String(env.STORE_LATITUDE), lng: String(env.STORE_LONGITUDE) },
          address: env.STORE_ADDRESS,
        },
        {
          coordinates: { lat: recipientLat, lng: recipientLng },
          address: recipientAddress,
        },
      ],
      scheduleAt: options?.scheduleAt || order.scheduled_for || undefined,
    })

    console.log(`[Fulfillment] Got quotation ${quotation.quotationId} for order ${orderId}`)

    // Step 2: Place order
    const lalamoveOrder = await lalamove.placeOrder({
      quotationId: quotation.quotationId,
      sender: {
        stopId: quotation.stops[0].stopId,
        name: 'Mad Krapow Store',
        phone: normalizeMalaysianPhone(env.STORE_PHONE) || env.STORE_PHONE,
      },
      recipients: [
        {
          stopId: quotation.stops[1].stopId,
          name: recipientName,
          phone: recipientPhone,
          remarks: buildLalamoveRemarks({
            displayCode: order.display_code,
            orderId,
            orderNumber: order.order_number,
            existingNotes: order.notes,
          }),
        },
      ],
      metadata: { orderId },
    })

    console.log(`[Fulfillment] Placed Lalamove order ${lalamoveOrder.orderId} for order ${orderId}`)

    const feeCents = Math.round(parseFloat(lalamoveOrder.priceBreakdown.total) * 100)
    const dispatchStatus = mapV3StatusToDispatch(lalamoveOrder.status)

    // Check for existing shipment
    const { data: existingShipment } = await supabase
      .from('lalamove_shipments')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle()

    const shipmentData = {
      order_id: orderId,
      quotation_id: quotation.quotationId,
      lalamove_order_id: lalamoveOrder.orderId,
      service_type: serviceType,
      dispatch_status: dispatchStatus,
      share_link: lalamoveOrder.shareLink,
      quoted_fee_cents: feeCents,
      actual_fee_cents: feeCents,
      currency: quotation.priceBreakdown.currency,
      sender_json: {
        name: 'Mad Krapow Store',
        phone: env.STORE_PHONE,
        address: env.STORE_ADDRESS,
        latitude: env.STORE_LATITUDE,
        longitude: env.STORE_LONGITUDE,
      },
      recipient_json: {
        name: recipientName,
        phone: recipientPhone,
        address: recipientAddress,
        latitude: parseFloat(recipientLat),
        longitude: parseFloat(recipientLng),
        postal_code: (address.postal_code as string) || '',
      },
      stop_ids: {
        pickup: quotation.stops[0].stopId,
        dropoff: quotation.stops[1].stopId,
      },
      quote_expires_at: quotation.expiresAt,
      schedule_at: options?.scheduleAt || order.scheduled_for || null,
      raw_order_response: lalamoveOrder as unknown as Record<string, unknown>,
      dispatched_at: new Date().toISOString(),
    }

    if (existingShipment) {
      await supabase.from('lalamove_shipments').update(shipmentData).eq('id', existingShipment.id)
    } else {
      await supabase.from('lalamove_shipments').insert(shipmentData)
    }

    // Update order
    await supabase
      .from('orders')
      .update({
        lalamove_order_id: lalamoveOrder.orderId,
        lalamove_quote_id: quotation.quotationId,
        lalamove_status: lalamoveOrder.status,
        dispatch_status: 'submitted',
        delivery_fee_cents: feeCents,
      })
      .eq('id', orderId)

    // Log event
    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: 'lalamove_order_placed',
      new_value: {
        lalamove_order_id: lalamoveOrder.orderId,
        status: lalamoveOrder.status,
        share_link: lalamoveOrder.shareLink,
        fee_cents: feeCents,
      },
    })

    return {
      success: true,
      lalamoveOrderId: lalamoveOrder.orderId,
      shareLink: lalamoveOrder.shareLink,
      dispatchStatus,
      feeCents,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Fulfillment] Failed for order ${orderId}:`, errorMessage)

    await supabase
      .from('orders')
      .update({ dispatch_status: 'failed' })
      .eq('id', orderId)

    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: 'lalamove_order_failed',
      new_value: { error: errorMessage },
    })

    return { success: false, dispatchStatus: 'failed', error: errorMessage }
  }
}

/**
 * Fulfill a scheduled delivery order.
 *
 * Always re-quotes near dispatch time (scheduled quote at checkout is estimate only).
 * If the new fee differs from the original, logs the variance but absorbs the cost.
 */
export async function fulfillScheduledOrder(
  supabase: ServiceClient,
  orderId: string
): Promise<FulfillmentResult> {
  // Fetch existing shipment to compare fee
  const { data: existingShipment } = await supabase
    .from('lalamove_shipments')
    .select('quoted_fee_cents')
    .eq('order_id', orderId)
    .maybeSingle()

  const result = await fulfillDeliveryOrder(supabase, orderId, { requote: true })

  // Log fee variance if requote resulted in different fee
  if (result.success && existingShipment?.quoted_fee_cents && result.feeCents) {
    const variance = result.feeCents - existingShipment.quoted_fee_cents
    if (Math.abs(variance) > 0) {
      console.log(
        `[Fulfillment] Scheduled order ${orderId} fee variance: ${variance > 0 ? '+' : ''}${variance} cents`
      )
      await supabase.from('order_events').insert({
        order_id: orderId,
        event_type: 'delivery_fee_variance',
        old_value: { original_fee_cents: existingShipment.quoted_fee_cents },
        new_value: { actual_fee_cents: result.feeCents, variance },
      })
    }
  }

  return result
}
