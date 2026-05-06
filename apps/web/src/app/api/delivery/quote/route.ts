import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLalamoveClient } from '@/lib/lalamove/client'
import {
  formatLalamoveCoordinate,
  moneyStringToCents,
  normalizePriceBreakdown,
  resolvePickup,
} from '@/lib/lalamove/quote'
import { getAuthenticatedUser } from '@/lib/supabase/server'
import { env } from '@/lib/validators/env'

const DeliveryQuoteRequestSchema = z.object({
  pickup: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().min(1),
  }).optional(),
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
  feeCents: number
  priceBreakdown: {
    base: string
    total: string
    currency: string
    extraMileage?: string
    surcharge?: string
  }
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
  let resolvedPickup: { latitude: number; longitude: number; address: string } | undefined
  try {
    const { user } = await getAuthenticatedUser(req)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to get a delivery quote', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const parsed = DeliveryQuoteRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const { pickup: requestPickup, dropoff, service_type } = parsed.data
    const lalamove = createLalamoveClient()

    const serviceType = service_type || env.LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE || 'MOTORCYCLE'

    // Server env is the source of truth. Client pickup remains accepted only for
    // trusted/internal callers and tests; public web/mobile clients should omit it.
    const pickup = resolvePickup(requestPickup)
    resolvedPickup = pickup

    if (!pickup.latitude || !pickup.longitude || !pickup.address) {
      console.error('[API] /api/delivery/quote: Missing pickup coordinates or address')
      return NextResponse.json(
        {
          success: false,
          error: 'Store location is not configured. Please contact support.',
          code: 'STORE_NOT_CONFIGURED',
        },
        { status: 500 }
      )
    }

    const quotation = await lalamove.getQuotation({
      serviceType,
      language: 'en_MY',
      stops: [
        {
          coordinates: {
            lat: formatLalamoveCoordinate(pickup.latitude),
            lng: formatLalamoveCoordinate(pickup.longitude),
          },
          address: pickup.address,
        },
        {
          coordinates: {
            lat: formatLalamoveCoordinate(dropoff.latitude),
            lng: formatLalamoveCoordinate(dropoff.longitude),
          },
          address: dropoff.address,
        },
      ],
    })

    const priceBreakdown = normalizePriceBreakdown(quotation.priceBreakdown)
    const totalFeeCents = moneyStringToCents(priceBreakdown.total)
    const baseFee = moneyStringToCents(priceBreakdown.base)

    const feeBreakdown: FeeBreakdown = {
      base: baseFee,
      distance: Math.max(totalFeeCents - baseFee, 0),
      platformFee: 0,
      total: totalFeeCents,
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
        feeCents: totalFeeCents,
        priceBreakdown,
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

    const lalamoveDetail = error instanceof Error && 'responseBody' in error
      ? ` | Lalamove: ${JSON.stringify((error as Error & { responseBody: unknown }).responseBody)}`
      : ''
    if (lalamoveDetail) {
      console.error('[API] /api/delivery/quote Lalamove detail:', lalamoveDetail)
    }

    const internalDetail = {
      hasApiKey: !!env.LALAMOVE_API_KEY,
      hasApiSecret: !!env.LALAMOVE_API_SECRET,
      lalamoveEnv: env.LALAMOVE_ENV,
      pickupUsed: resolvedPickup ?? '(not resolved before error)',
    }
    console.error('[API] /api/delivery/quote internal detail:', internalDetail)

    return NextResponse.json(
      {
        success: false,
        error: isOutOfZone
          ? 'Delivery address is outside our service area'
          : `Unable to get delivery quote: ${errorMessage}`,
        code: isOutOfZone ? 'OUT_OF_ZONE' : 'QUOTE_FAILED',
      },
      { status: isOutOfZone ? 422 : 500 }
    )
  }
}
