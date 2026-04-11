import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { normalizeMalaysianPhone } from '@/lib/lalamove/phone'
import { mapV3StatusToDispatch } from '@/lib/lalamove/status-mapper'
import { getServiceClient } from '@/lib/supabase/server'
import { env } from '@/lib/validators/env'

const PlaceOrderRequestSchema = z.object({
  order_id: z.string().uuid(),
  quotation_id: z.string().min(1),
  sender_stop_id: z.string().min(1),
  recipient_stop_id: z.string().min(1),
})

interface PlaceOrderResponse {
  success: true
  lalamoveOrderId: string
  shareLink: string
  status: string
  dispatchStatus: string
  feeCents: number
}

interface PlaceOrderError {
  success: false
  error: string
  code?: string
}

type PlaceOrderResult = PlaceOrderResponse | PlaceOrderError

export async function POST(req: NextRequest): Promise<NextResponse<PlaceOrderResult>> {
  try {
    const body = await req.json()
    const parsed = PlaceOrderRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request: ' + parsed.error.issues.map(i => i.message).join(', '),
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      )
    }

    const { order_id, quotation_id, sender_stop_id, recipient_stop_id } = parsed.data
    const supabase = getServiceClient()

    // Fetch order to verify it exists and is in correct state
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json(
        { success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' },
        { status: 404 }
      )
    }

    // Check if there's already a non-draft shipment
    const { data: existingShipment } = await supabase
      .from('lalamove_shipments')
      .select('*')
      .eq('order_id', order_id)
      .not('lalamove_order_id', 'is', null)
      .maybeSingle()

    if (existingShipment) {
      return NextResponse.json(
        {
          success: false,
          error: 'Order already has an active shipment',
          code: 'DUPLICATE_SHIPMENT',
        },
        { status: 409 }
      )
    }

    // Verify quotation is not expired
    const { data: draftShipment } = await supabase
      .from('lalamove_shipments')
      .select('*')
      .eq('order_id', order_id)
      .eq('quotation_id', quotation_id)
      .maybeSingle()

    if (draftShipment?.quote_expires_at) {
      const expiresAt = new Date(draftShipment.quote_expires_at)
      if (expiresAt < new Date()) {
        return NextResponse.json(
          {
            success: false,
            error: 'Quotation has expired. Please get a new quote.',
            code: 'QUOTATION_EXPIRED',
          },
          { status: 422 }
        )
      }
    }

    // Extract sender/recipient from the draft shipment or order
    const senderJson = draftShipment?.sender_json as Record<string, unknown> | null
    const recipientJson = draftShipment?.recipient_json as Record<string, unknown> | null

    const senderName = (senderJson?.name as string) || 'Mad Krapow Store'
    const senderPhone = (senderJson?.phone as string) || env.STORE_PHONE
    const recipientName = (recipientJson?.name as string) || order.customer_name || 'Customer'
    const recipientPhone = normalizeMalaysianPhone(
      (recipientJson?.phone as string) || order.customer_phone || '+60000000000'
    )!

    const lalamove = createLalamoveClient()

    // Place order with v3 API
    const lalamoveOrder = await lalamove.placeOrder({
      quotationId: quotation_id,
      sender: {
        stopId: sender_stop_id,
        name: senderName,
        phone: normalizeMalaysianPhone(senderPhone) || senderPhone,
      },
      recipients: [
        {
          stopId: recipient_stop_id,
          name: recipientName,
          phone: recipientPhone,
          remarks: `Order #${order.order_number || order_id.slice(0, 8)}`,
        },
      ],
      metadata: {
        orderId: order_id,
        orderNumber: order.order_number || '',
      },
    })

    // Convert actual fee to cents
    const actualFeeCents = Math.round(
      parseFloat(lalamoveOrder.priceBreakdown.total) * 100
    )

    const dispatchStatus = mapV3StatusToDispatch(lalamoveOrder.status)

    // Insert or update shipment record
    const shipmentData = {
      order_id,
      quotation_id,
      lalamove_order_id: lalamoveOrder.orderId,
      service_type: draftShipment?.service_type || 'MOTORCYCLE',
      dispatch_status: dispatchStatus,
      share_link: lalamoveOrder.shareLink,
      quoted_fee_cents: draftShipment?.quoted_fee_cents || actualFeeCents,
      actual_fee_cents: actualFeeCents,
      currency: lalamoveOrder.priceBreakdown.currency,
      sender_json: senderJson || {
        name: senderName,
        phone: senderPhone,
        address: '',
        latitude: 0,
        longitude: 0,
      },
      recipient_json: recipientJson || {
        name: recipientName,
        phone: recipientPhone,
        address: '',
        latitude: 0,
        longitude: 0,
        postal_code: '',
      },
      stop_ids: {
        pickup: sender_stop_id,
        dropoff: recipient_stop_id,
      },
      schedule_at: draftShipment?.schedule_at || null,
      raw_order_response: lalamoveOrder as unknown as Record<string, unknown>,
      dispatched_at: new Date().toISOString(),
    }

    if (draftShipment) {
      // Update existing draft shipment
      await supabase
        .from('lalamove_shipments')
        .update(shipmentData)
        .eq('id', draftShipment.id)
    } else {
      // Insert new shipment
      await supabase.from('lalamove_shipments').insert(shipmentData)
    }

    // Update order status
    await supabase
      .from('orders')
      .update({
        lalamove_order_id: lalamoveOrder.orderId,
        lalamove_quote_id: quotation_id,
        lalamove_status: lalamoveOrder.status,
        dispatch_status: 'submitted',
        delivery_fee_cents: actualFeeCents,
      })
      .eq('id', order_id)

    // Log event
    await supabase.from('order_events').insert({
      order_id,
      event_type: 'lalamove_order_placed',
      new_value: {
        lalamove_order_id: lalamoveOrder.orderId,
        status: lalamoveOrder.status,
        share_link: lalamoveOrder.shareLink,
      },
    })

    return NextResponse.json(
      {
        success: true,
        lalamoveOrderId: lalamoveOrder.orderId,
        shareLink: lalamoveOrder.shareLink,
        status: lalamoveOrder.status,
        dispatchStatus,
        feeCents: actualFeeCents,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] /api/shipping/lalamove/orders POST:', error)

    const message = error instanceof Error ? error.message : 'Unknown error'
    const isExpired = message.includes('expired') || message.includes('EXPIRED')
    const isInsufficientCredit = message.includes('INSUFFICIENT_CREDIT')

    let code = 'ORDER_FAILED'
    let statusCode = 500

    if (isExpired) {
      code = 'QUOTATION_EXPIRED'
      statusCode = 422
    } else if (isInsufficientCredit) {
      code = 'INSUFFICIENT_CREDIT'
      statusCode = 402
    }

    return NextResponse.json(
      {
        success: false,
        error: isExpired
          ? 'Quotation has expired. Please get a new quote.'
          : isInsufficientCredit
            ? 'Lalamove wallet credit insufficient.'
            : 'Unable to place delivery order. Please try again.',
        code,
      },
      { status: statusCode }
    )
  }
}
