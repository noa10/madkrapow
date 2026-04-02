import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { env } from '@/lib/validators/env'

const DeliveryQuoteRequestSchema = z.object({
  dropoff: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().min(1),
  }),
  service_type: z.string().optional(),
})

interface FeeBreakdown {
  base: number
  distance: number
  platformFee: number
  total: number
}

interface DeliveryQuoteResponse {
  success: true
  quotationId: string
  stopIds: { pickup: string; dropoff: string }
  fee: FeeBreakdown
  currency: string
  distance: { value: string; unit: string }
  serviceType: string
  expiresAt: string
}

interface DeliveryQuoteError {
  success: false
  error: string
  code?: string
}

type DeliveryQuoteResult = DeliveryQuoteResponse | DeliveryQuoteError

export async function POST(req: NextRequest): Promise<NextResponse<DeliveryQuoteResult>> {
  try {
    const body = await req.json()
    const parsed = DeliveryQuoteRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const { dropoff, service_type } = parsed.data
    const lalamove = createLalamoveClient()

    const serviceType = service_type || env.LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE || 'MOTORCYCLE'

    const quotation = await lalamove.getQuotation({
      serviceType,
      language: 'en_MY',
      stops: [
        {
          coordinates: {
            lat: String(env.STORE_LATITUDE),
            lng: String(env.STORE_LONGITUDE),
          },
          address: env.STORE_ADDRESS,
        },
        {
          coordinates: {
            lat: String(dropoff.latitude),
            lng: String(dropoff.longitude),
          },
          address: dropoff.address,
        },
      ],
    })

    // Convert MYR price to cents (MY uses 1 decimal: "50.5" → 505 cents)
    const totalFeeCents = Math.round(parseFloat(quotation.priceBreakdown.total) * 100)
    const distanceKm = parseFloat(quotation.distance.value) / 1000
    const baseFee = 500
    const perKmFee = Math.min(Math.round(distanceKm * 100), 500)
    const platformFee = Math.round(totalFeeCents * 0.05)

    const feeBreakdown: FeeBreakdown = {
      base: baseFee,
      distance: perKmFee,
      platformFee,
      total: totalFeeCents + platformFee,
    }

    return NextResponse.json(
      {
        success: true,
        quotationId: quotation.quotationId,
        stopIds: {
          pickup: quotation.stops[0].stopId,
          dropoff: quotation.stops[1].stopId,
        },
        fee: feeBreakdown,
        currency: quotation.priceBreakdown.currency,
        distance: quotation.distance,
        serviceType: quotation.serviceType,
        expiresAt: quotation.expiresAt,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/delivery/quote:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isOutOfZone =
      errorMessage.toLowerCase().includes('zone') ||
      errorMessage.toLowerCase().includes('service area') ||
      errorMessage.toLowerCase().includes('coverage') ||
      errorMessage.includes('ERR_OUT_OF_SERVICE_AREA')

    return NextResponse.json(
      {
        success: false,
        error: isOutOfZone
          ? 'Delivery address is outside our service area'
          : 'Unable to get delivery quote. Please try again.',
        code: isOutOfZone ? 'OUT_OF_ZONE' : 'QUOTE_FAILED',
      },
      { status: isOutOfZone ? 422 : 500 }
    )
  }
}
