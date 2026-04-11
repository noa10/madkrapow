import { NextRequest, NextResponse } from 'next/server'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { mapV3StatusToDispatch } from '@/lib/lalamove/status-mapper'
import { getServiceClient } from '@/lib/supabase/server'

interface ShipmentDetailResponse {
  success: true
  shipment: {
    id: string
    order_id: string
    lalamove_order_id: string | null
    quotation_id: string
    service_type: string
    dispatch_status: string
    share_link: string | null
    quoted_fee_cents: number
    actual_fee_cents: number | null
    currency: string
    sender: Record<string, unknown> | null
    recipient: Record<string, unknown> | null
    driver: {
      name: string | null
      phone: string | null
      plate: string | null
      photo_url: string | null
      latitude: number | null
      longitude: number | null
      location_updated_at: string | null
    }
    schedule_at: string | null
    dispatched_at: string | null
    completed_at: string | null
    cancelled_at: string | null
    cancellation_reason: string | null
    created_at: string
    updated_at: string
  }
  lalamove?: {
    status: string
    shareLink: string
    driverId: string
    stops: unknown[]
    distance: { value: string; unit: string }
  }
}

interface ShipmentDetailError {
  success: false
  error: string
  code?: string
}

type ShipmentDetailResult = ShipmentDetailResponse | ShipmentDetailError

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ShipmentDetailResult>> {
  try {
    const { id: orderId } = await params
    const supabase = getServiceClient()

    // Fetch the most recent shipment for this order
    const { data: shipment, error } = await supabase
      .from('lalamove_shipments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[API] Error fetching shipment:', error)
      return NextResponse.json(
        { success: false, error: 'Database error', code: 'DB_ERROR' },
        { status: 500 }
      )
    }

    if (!shipment) {
      return NextResponse.json(
        { success: false, error: 'No shipment found for this order', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // Build response from local data
    const response: ShipmentDetailResponse = {
      success: true,
      shipment: {
        id: shipment.id,
        order_id: shipment.order_id,
        lalamove_order_id: shipment.lalamove_order_id,
        quotation_id: shipment.quotation_id,
        service_type: shipment.service_type,
        dispatch_status: shipment.dispatch_status,
        share_link: shipment.share_link,
        quoted_fee_cents: shipment.quoted_fee_cents,
        actual_fee_cents: shipment.actual_fee_cents,
        currency: shipment.currency,
        sender: shipment.sender_json as Record<string, unknown> | null,
        recipient: shipment.recipient_json as Record<string, unknown> | null,
        driver: {
          name: shipment.driver_name,
          phone: shipment.driver_phone,
          plate: shipment.driver_plate,
          photo_url: shipment.driver_photo_url,
          latitude: shipment.driver_latitude,
          longitude: shipment.driver_longitude,
          location_updated_at: shipment.driver_location_updated_at,
        },
        schedule_at: shipment.schedule_at,
        dispatched_at: shipment.dispatched_at,
        completed_at: shipment.completed_at,
        cancelled_at: shipment.cancelled_at,
        cancellation_reason: shipment.cancellation_reason,
        created_at: shipment.created_at,
        updated_at: shipment.updated_at,
      },
    }

    // If there's an active Lalamove order, fetch live details
    if (shipment.lalamove_order_id) {
      try {
        const lalamove = createLalamoveClient()
        const orderDetails = await lalamove.getOrderDetails(shipment.lalamove_order_id)

        response.lalamove = {
          status: orderDetails.status,
          shareLink: orderDetails.shareLink,
          driverId: orderDetails.driverId,
          stops: orderDetails.stops,
          distance: orderDetails.distance,
        }

        // Update local status if it changed
        const liveStatus = mapV3StatusToDispatch(orderDetails.status)
        if (liveStatus !== shipment.dispatch_status) {
          await supabase
            .from('lalamove_shipments')
            .update({
              dispatch_status: liveStatus,
              share_link: orderDetails.shareLink,
            })
            .eq('id', shipment.id)

          response.shipment.dispatch_status = liveStatus
          response.shipment.share_link = orderDetails.shareLink
        }
      } catch {
        // Lalamove API may return 403 for old orders - return local data
      }
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('[API] /api/shipping/lalamove/orders GET:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shipment details' },
      { status: 500 }
    )
  }
}

// ---- DELETE: Cancel shipment ----

interface CancelResponse {
  success: true
  message: string
  dispatch_status: string
}

interface CancelError {
  success: false
  error: string
  code?: string
}

type CancelResult = CancelResponse | CancelError

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<CancelResult>> {
  try {
    const { id: orderId } = await params
    const supabase = getServiceClient()

    // Fetch the most recent shipment with an active Lalamove order
    const { data: shipment } = await supabase
      .from('lalamove_shipments')
      .select('*')
      .eq('order_id', orderId)
      .not('lalamove_order_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!shipment) {
      return NextResponse.json(
        { success: false, error: 'No active shipment found for this order', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    if (!shipment.lalamove_order_id) {
      return NextResponse.json(
        { success: false, error: 'Shipment has no Lalamove order ID', code: 'NO_LALAMOVE_ORDER' },
        { status: 400 }
      )
    }

    // Check if already in a terminal state
    const terminalStatuses = ['delivered', 'cancelled', 'failed']
    if (terminalStatuses.includes(shipment.dispatch_status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot cancel: shipment is already ${shipment.dispatch_status}`,
          code: 'TERMINAL_STATUS',
        },
        { status: 400 }
      )
    }

    const lalamove = createLalamoveClient()

    // Attempt cancellation
    try {
      await lalamove.cancelOrder(shipment.lalamove_order_id)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('403') || message.includes('Forbidden')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Cancellation window has passed. Order can only be cancelled within 5 minutes of driver assignment.',
            code: 'CANCELLATION_WINDOW_PASSED',
          },
          { status: 403 }
        )
      }
      throw error
    }

    // Update shipment
    await supabase
      .from('lalamove_shipments')
      .update({
        dispatch_status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'Cancelled by restaurant',
      })
      .eq('id', shipment.id)

    // Update order
    await supabase
      .from('orders')
      .update({
        lalamove_status: 'CANCELED',
        dispatch_status: 'cancelled',
      })
      .eq('id', orderId)

    // Log event
    await supabase.from('order_events').insert({
      order_id: orderId,
      event_type: 'lalamove_order_cancelled',
      old_value: { dispatch_status: shipment.dispatch_status },
      new_value: { dispatch_status: 'cancelled', reason: 'Cancelled by restaurant' },
    })

    return NextResponse.json(
      {
        success: true,
        message: 'Shipment cancelled successfully',
        dispatch_status: 'cancelled',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/shipping/lalamove/orders DELETE:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to cancel shipment' },
      { status: 500 }
    )
  }
}
