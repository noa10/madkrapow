import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import {
  AutoPromoQueryError,
  getAutoAppliedPromos,
} from '@/lib/promos/auto'
import { z } from 'zod'

const AutoPromoRequestSchema = z.object({
  subtotalCents: z.number().int().nonnegative(),
  deliveryFeeCents: z.number().int().nonnegative(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = AutoPromoRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const { subtotalCents, deliveryFeeCents } = parsed.data
    let applied
    try {
      applied = await getAutoAppliedPromos(
        getServiceClient(),
        subtotalCents,
        deliveryFeeCents,
      )
    } catch (error) {
      // A query failure is not a bad request: keep the old 200/[] shape but
      // tell callers the discount was not evaluated, so they can retry.
      if (error instanceof AutoPromoQueryError) {
        return NextResponse.json(
          { applied: [], promosUnavailable: true },
          { status: 200 },
        )
      }
      throw error
    }

    return NextResponse.json({ applied }, { status: 200 })
  } catch (error) {
    console.error('[API] /api/promos/auto:', error)
    return NextResponse.json(
      { error: 'Unable to fetch auto-promos', code: 'AUTO_PROMO_FAILED' },
      { status: 500 }
    )
  }
}
