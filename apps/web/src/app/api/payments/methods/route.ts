import { NextResponse } from 'next/server'
import { isBillplzAvailable } from '@/lib/billplz/client'
import { isStripeAvailable } from '@/lib/stripe/config'
import { PAYMENT_METHOD_OPTIONS } from '@/lib/payments/methods'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Payment methods the checkout can offer right now.
 *
 * A method is listed only when it is enabled, fully configured, and pointed at
 * the environment matching its credentials. This is what keeps a test-mode
 * gateway from rendering a payment button that cannot take money.
 */
export async function GET(): Promise<NextResponse> {
  const availability: Record<string, boolean> = {
    stripe: isStripeAvailable(),
    billplz: isBillplzAvailable(),
  }

  const methods = PAYMENT_METHOD_OPTIONS.filter(
    (method) => availability[method.id] === true,
  )

  return NextResponse.json(
    { success: true, methods },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
