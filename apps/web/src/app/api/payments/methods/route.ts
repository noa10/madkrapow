import { NextResponse } from 'next/server'
import { getAvailablePaymentMethods } from '@/lib/payments/availability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Payment methods the checkout can offer right now.
 *
 * Kept as a standalone endpoint for clients that only need the method list;
 * the checkout itself gets the same list from `/api/checkout/bootstrap`.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { success: true, methods: getAvailablePaymentMethods() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
