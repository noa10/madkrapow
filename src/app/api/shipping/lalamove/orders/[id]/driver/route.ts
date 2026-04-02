import { NextRequest, NextResponse } from 'next/server'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { getServiceClient } from '@/lib/supabase/server'

interface DriverDetailResponse {
  success: true
  driver: {
    driverId: string
    name: string
    phone: string
    plateNumber: string
    photo?: string
    coordinates?: {
      lat: string
      lng: string
      updatedAt: string
    }
  }
  shipment: {
    driver_name: string | null
    driver_phone: string | null
    driver_plate: string | null
    driver_photo_url: string | null
    driver_latitude: number | null
    driver_longitude: number | null
    driver_location_updated_at: string | null
  }
}

interface DriverDetailError {
  success: false
  error: string
  code?: string
}

type DriverDetailResult = DriverDetailResponse | DriverDetailError

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<DriverDetailResult>> {
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

    if (!shipment?.lalamove_order_id) {
      return NextResponse.json(
        { success: false, error: 'No active shipment with Lalamove order', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    const lalamove = createLalamoveClient()

    // First get order details to find driverId
    const orderDetails = await lalamove.getOrderDetails(shipment.lalamove_order_id)

    if (!orderDetails.driverId) {
      return NextResponse.json(
        { success: false, error: 'No driver assigned yet', code: 'NO_DRIVER' },
        { status: 404 }
      )
    }

    // Fetch driver details
    let driverDetails
    try {
      driverDetails = await lalamove.getDriverDetails(
        shipment.lalamove_order_id,
        orderDetails.driverId
      )
    } catch {
      // Driver details may return 403 if outside the driver details window
      return NextResponse.json(
        {
          success: false,
          error: 'Driver details not available yet (window not open)',
          code: 'DRIVER_DETAILS_UNAVAILABLE',
        },
        { status: 403 }
      )
    }

    // Update local driver info
    const updateData: Record<string, unknown> = {
      driver_name: driverDetails.name,
      driver_phone: driverDetails.phone,
      driver_plate: driverDetails.plateNumber,
      driver_photo_url: driverDetails.photo || null,
    }

    if (driverDetails.coordinates) {
      updateData.driver_latitude = parseFloat(driverDetails.coordinates.lat)
      updateData.driver_longitude = parseFloat(driverDetails.coordinates.lng)
      updateData.driver_location_updated_at = driverDetails.coordinates.updatedAt
    }

    await supabase
      .from('lalamove_shipments')
      .update(updateData)
      .eq('id', shipment.id)

    return NextResponse.json(
      {
        success: true,
        driver: {
          driverId: driverDetails.driverId,
          name: driverDetails.name,
          phone: driverDetails.phone,
          plateNumber: driverDetails.plateNumber,
          photo: driverDetails.photo,
          coordinates: driverDetails.coordinates,
        },
        shipment: {
          driver_name: driverDetails.name,
          driver_phone: driverDetails.phone,
          driver_plate: driverDetails.plateNumber,
          driver_photo_url: driverDetails.photo || null,
          driver_latitude: driverDetails.coordinates
            ? parseFloat(driverDetails.coordinates.lat)
            : null,
          driver_longitude: driverDetails.coordinates
            ? parseFloat(driverDetails.coordinates.lng)
            : null,
          driver_location_updated_at: driverDetails.coordinates?.updatedAt || null,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/shipping/lalamove/orders/driver GET:', error)

    const message = error instanceof Error ? error.message : ''
    const isForbidden = message.includes('403') || message.includes('Forbidden')

    return NextResponse.json(
      {
        success: false,
        error: isForbidden
          ? 'Driver details not available yet'
          : 'Failed to fetch driver details',
        code: isForbidden ? 'FORBIDDEN' : 'FETCH_FAILED',
      },
      { status: isForbidden ? 403 : 500 }
    )
  }
}
