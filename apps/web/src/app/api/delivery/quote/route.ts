import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLalamoveClient } from '@/lib/lalamove/client'
import { LalamoveApiError } from '@/lib/lalamove/types'
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
  let citiesCheck: string | undefined
  let rawTestDetail: string | undefined
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

    try {
      await lalamove.getCityInfo()
      citiesCheck = 'OK'
    } catch (e) {
      const citiesErr = e instanceof LalamoveApiError
        ? `${e.statusCode}: ${e.message} | ${JSON.stringify(e.responseBody)}`
        : e instanceof Error ? e.message : String(e)
      citiesCheck = `FAILED — ${citiesErr}`

      const testPath = '/v3/cities?countryIso2=MY'
      const testAuthPath = testPath.split('?')[0]
      const timestamp = Date.now().toString()
      const apiKey = env.LALAMOVE_API_KEY ?? ''
      const apiSecret = env.LALAMOVE_API_SECRET ?? ''
      const sigRaw = `${timestamp}\r\nGET\r\n${testAuthPath}\r\n\r\n`
      const crypto = await import('crypto')
      const sig = crypto.createHmac('sha256', apiSecret).update(sigRaw).digest('hex')
      const testUrl = `https://rest.sandbox.lalamove.com${testPath}`
      rawTestDetail = [
        `url=${testUrl}`,
        `keyPrefix=${apiKey.slice(0, 8)}... keyLen=${apiKey.length}`,
        `secretPrefix=${apiSecret.slice(0, 8)}... secretLen=${apiSecret.length}`,
        `lalamoveEnv=${env.LALAMOVE_ENV}`,
        `LALAMOVE_BASE_URL=${env.LALAMOVE_BASE_URL ?? '(unset)'}`,
        `sigInput="${sigRaw.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`,
        `authHeader=hmac ${apiKey.slice(0, 8)}...:${timestamp}:${sig.slice(0, 16)}...`,
      ].join(' | ')

      try {
        const rawResp = await fetch(testUrl, {
          method: 'GET',
          headers: {
            'Authorization': `hmac ${apiKey}:${timestamp}:${sig}`,
            'Market': 'MY',
            'Request-ID': crypto.randomUUID(),
          },
        })
        const rawBody = await rawResp.text()
        rawTestDetail += ` | rawStatus=${rawResp.status} rawBody=${rawBody.slice(0, 300)}`
      } catch (fetchErr) {
        rawTestDetail += ` | rawFetchErr=${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
      }
    }

    const serviceType = service_type || env.LALAMOVE_DEFAULT_STANDARD_SERVICE_TYPE || 'MOTORCYCLE'

    // Use pickup from request body if provided, otherwise fall back to env vars
    const pickup = requestPickup ?? {
      latitude: env.STORE_LATITUDE,
      longitude: env.STORE_LONGITUDE,
      address: env.STORE_ADDRESS,
    }
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

    // Lalamove's regex only allows up to 15 decimal places; geocoded values
    // often exceed this. 8 decimals gives sub-millimetre precision.
    const fmt = (v: number | string) => {
      const n = typeof v === 'string' ? parseFloat(v) : v
      return n.toFixed(8)
    }

    const quotation = await lalamove.getQuotation({
      serviceType,
      language: 'en_MY',
      stops: [
        {
          coordinates: {
            lat: fmt(pickup.latitude),
            lng: fmt(pickup.longitude),
          },
          address: pickup.address,
        },
        {
          coordinates: {
            lat: fmt(dropoff.latitude),
            lng: fmt(dropoff.longitude),
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

    const lalamoveDetail = error instanceof Error && 'responseBody' in error
      ? ` | Lalamove: ${JSON.stringify((error as Error & { responseBody: unknown }).responseBody)}`
      : ''

    const diag = {
      hasApiKey: !!env.LALAMOVE_API_KEY,
      hasApiSecret: !!env.LALAMOVE_API_SECRET,
      lalamoveEnv: env.LALAMOVE_ENV,
      pickupUsed: resolvedPickup ?? '(not resolved before error)',
      citiesCheck,
      rawTestDetail,
    }

    return NextResponse.json(
      {
        success: false,
        error: isOutOfZone
          ? 'Delivery address is outside our service area'
          : `Unable to get delivery quote: ${errorMessage}${lalamoveDetail}`,
        code: isOutOfZone ? 'OUT_OF_ZONE' : 'QUOTE_FAILED',
        diag,
      },
      { status: isOutOfZone ? 422 : 500 }
    )
  }
}
