import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { isServiceAvailable } from '@/lib/lalamove/city-resolver'
import { env } from '@/lib/validators/env'

const QuoteRequestSchema = z.object({
  order_id: z.string().uuid(),
  pickup: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().min(1),
    name: z.string().optional(),
    phone: z.string().optional(),
  }),
  dropoff: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().min(1),
    name: z.string().optional(),
    phone: z.string().optional(),
  }),
  service_type: z.string().optional(),
  schedule_at: z.string().datetime().optional(),
})

interface QuoteResponse {
  success: true
  quotationId: string
  serviceType: string
  expiresAt: string
  stopIds: { pickup: string; dropoff: string }
  priceBreakdown: {
    base: string
    total: string
    currency: string
    [key: string]: string
  }
  feeCents: number
  distance: { value: string; unit: string }
  scheduleAt?: string
}

interface QuoteError {
  success: false
  error: string
  code?: string
}

type QuoteResult = QuoteResponse | QuoteError

export async function POST(req: NextRequest): Promise<NextResponse<QuoteResult>> {
  try {
    const body = await req.json()
    const parsed = QuoteRequestSchema.safeParse(body)

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

    const { pickup, dropoff, service_type, schedule_at } = parsed.data

    const lalamove = createLalamoveClient()

    // Resolve service type from city info or use provided/default
    const effectiveServiceType = service_type || env.LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE || 'MOTORCYCLE'

    // Validate service type against city info if available
    try {
      const cities = await lalamove.getCityInfo()
      const cityName = env.LALAMOVE_CITY_NAME || 'Shah Alam'
      const city = cities.find(
        (c: { name: string }) => c.name.toLowerCase() === cityName.toLowerCase()
      )
      if (city && !isServiceAvailable(city, effectiveServiceType)) {
        return NextResponse.json(
          {
            success: false,
            error: `Service type "${effectiveServiceType}" is not available in ${city.name}. Available: ${city.services.map((s: { serviceType: string }) => s.serviceType).join(', ')}`,
            code: 'SERVICE_UNAVAILABLE',
          },
          { status: 400 }
        )
      }
    } catch {
      // City info fetch failed - proceed anyway, API will validate
    }

    // Build quotation request
    const quotationRequest = {
      serviceType: effectiveServiceType,
      language: 'en_MY' as const,
      stops: [
        {
          coordinates: {
            lat: String(pickup.latitude),
            lng: String(pickup.longitude),
          },
          address: pickup.address,
        },
        {
          coordinates: {
            lat: String(dropoff.latitude),
            lng: String(dropoff.longitude),
          },
          address: dropoff.address,
        },
      ],
      scheduleAt: schedule_at,
      // Only include item block if city supports it
      item: undefined as { quantity: string; weight: string } | undefined,
    }

    const quotation = await lalamove.getQuotation(quotationRequest)

    // Convert price to cents (MY uses 1 decimal: "50.5" → 505)
    const feeCents = Math.round(parseFloat(quotation.priceBreakdown.total) * 100)

    return NextResponse.json(
      {
        success: true,
        quotationId: quotation.quotationId,
        serviceType: quotation.serviceType,
        expiresAt: quotation.expiresAt,
        stopIds: {
          pickup: quotation.stops[0].stopId,
          dropoff: quotation.stops[1].stopId,
        },
        priceBreakdown: {
          base: quotation.priceBreakdown.base,
          total: quotation.priceBreakdown.total,
          currency: quotation.priceBreakdown.currency,
          ...(quotation.priceBreakdown.extraMileage && { extraMileage: quotation.priceBreakdown.extraMileage }),
          ...(quotation.priceBreakdown.surcharge && { surcharge: quotation.priceBreakdown.surcharge }),
        },
        feeCents,
        distance: quotation.distance,
        scheduleAt: schedule_at,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/shipping/lalamove/quote:', error)

    const message = error instanceof Error ? error.message : 'Unknown error'
    const isOutOfZone =
      message.includes('ERR_OUT_OF_SERVICE_AREA') ||
      message.toLowerCase().includes('out of service area')

    const lalamoveDetail = error instanceof Error && 'responseBody' in error
      ? ` | Lalamove: ${JSON.stringify((error as Error & { responseBody: unknown }).responseBody)}`
      : ''

    return NextResponse.json(
      {
        success: false,
        error: isOutOfZone
          ? 'Delivery address is outside our service area'
          : `Unable to get delivery quote: ${message}${lalamoveDetail}`,
        code: isOutOfZone ? 'OUT_OF_ZONE' : 'QUOTE_FAILED',
      },
      { status: isOutOfZone ? 422 : 500 }
    )
  }
}
