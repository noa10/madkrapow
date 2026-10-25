import { NextResponse } from 'next/server'
import { isBillplzConfigured } from '@/lib/billplz/client'
import { env } from '@/lib/validators/env'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payments/methods'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Payment methods the checkout can offer right now.
 *
 * Billplz is only listed when its credentials are configured, so a deployment
 * that has not finished onboarding cannot show a method that would fail after
 * the customer has entered their details.
 */
export async function GET(): Promise<NextResponse> {
  const billplzAvailable = env.BILLPLZ_ENABLED && isBillplzConfigured()

  const methods = PAYMENT_METHOD_OPTIONS.filter(
    (method) => method.id !== 'billplz' || billplzAvailable,
  )

  return NextResponse.json(
    { success: true, methods },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
