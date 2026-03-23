import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { LalamoveClient } from '@/lib/lalamove/client'
import { env } from '@/lib/validators/env'

const DeliveryQuoteRequestSchema = z.object({
  dropoff: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().min(1),
  }),
})

interface FeeBreakdown {
  base: number
  distance: number
  platformFee: number
  total: number
}

interface DeliveryQuoteResponse {
  success: true
  fee: FeeBreakdown
  currency: string
  distance: string
  duration: string
  serviceType: string
  eta: string
  expiresAt: string
}

interface DeliveryQuoteError {
  success: false
  error: string
  code?: string
}

type DeliveryQuoteResult = DeliveryQuoteResponse | DeliveryQuoteError

function getStoreLocation() {
  return {
    latitude: Number(env.STORE_LATITUDE),
    longitude: Number(env.STORE_LONGITUDE),
    address: env.STORE_ADDRESS,
    phone: env.STORE_PHONE,
  }
}

function calculateFeeBreakdown(totalFee: number, distance: string): FeeBreakdown {
  const distanceKm = parseFloat(distance) || 0
  const baseFee = 500
  const perKmFee = Math.min(distanceKm * 100, 500)
  const platformFee = Math.round(totalFee * 0.05)

  return {
    base: baseFee,
    distance: perKmFee,
    platformFee,
    total: totalFee + platformFee,
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<DeliveryQuoteResult>> {
  try {
    const body = await req.json()
    const parsed = DeliveryQuoteRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request',
          code: 'INVALID_REQUEST',
        },
        { status: 400 }
      )
    }

    const { dropoff } = parsed.data
    const store = getStoreLocation()

    const lalamove = new LalamoveClient()

    const quotation = await lalamove.getQuotation({
      stops: [
        {
          location: {
            street: store.address,
            city: env.STORE_CITY,
            country: 'MY',
          },
          contact: {
            name: 'Store',
            phone: store.phone,
          },
        },
        {
          location: {
            street: dropoff.address,
            city: env.STORE_CITY,
            country: 'MY',
            zipcode: '',
          },
          contact: {
            name: 'Customer',
            phone: '+60000000000',
          },
        },
      ],
      isRouteInfoEnabled: true,
    })

    const totalFeeCents = Math.round(parseFloat(quotation.totalFee) * 100)
    const feeBreakdown = calculateFeeBreakdown(totalFeeCents, quotation.distance)

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    return NextResponse.json(
      {
        success: true,
        fee: feeBreakdown,
        currency: quotation.currency,
        distance: quotation.distance,
        duration: quotation.duration,
        serviceType: 'MOTORCYCLE',
        eta: quotation.duration,
        expiresAt,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] /api/delivery/quote:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const isOutOfZone = errorMessage.toLowerCase().includes('zone') ||
                        errorMessage.toLowerCase().includes('service area') ||
                        errorMessage.toLowerCase().includes('coverage')

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
