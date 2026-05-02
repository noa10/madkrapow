import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const ValidatePromoRequestSchema = z.object({
  code: z.string().min(1),
  subtotalCents: z.number().int().positive(),
  deliveryFeeCents: z.number().int().nonnegative(),
  scope: z.enum(['order', 'delivery']).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = ValidatePromoRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { valid: false, error: 'Invalid request', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const { code, subtotalCents, deliveryFeeCents, scope } = parsed.data

    const supabase = getServiceClient()
    const query = supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code.toLowerCase())
      .eq('is_active', true)

    if (scope) {
      query.eq('scope', scope)
    }

    const { data: promo, error } = await query.single()

    if (error || !promo) {
      return NextResponse.json(
        { valid: false, error: 'Invalid promo code', code: 'INVALID_CODE' },
        { status: 404 }
      )
    }

    // Check date range
    const now = new Date().toISOString()
    if (promo.valid_from && now < promo.valid_from) {
      return NextResponse.json(
        { valid: false, error: 'Promo code is not yet active', code: 'NOT_YET_ACTIVE' },
        { status: 400 }
      )
    }
    if (promo.valid_until && now > promo.valid_until) {
      return NextResponse.json(
        { valid: false, error: 'Promo code has expired', code: 'EXPIRED' },
        { status: 400 }
      )
    }

    // Check usage limits
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      return NextResponse.json(
        { valid: false, error: 'Promo code has reached its usage limit', code: 'MAX_USES_REACHED' },
        { status: 400 }
      )
    }

    // Check min order amount
    if (promo.min_order_amount_cents) {
      const base = promo.scope === 'delivery' ? deliveryFeeCents : subtotalCents
      if (base < promo.min_order_amount_cents) {
        return NextResponse.json(
          {
            valid: false,
            error: `Minimum order amount of RM${(promo.min_order_amount_cents / 100).toFixed(2)} required`,
            code: 'MIN_ORDER_NOT_MET',
            minOrderCents: promo.min_order_amount_cents,
          },
          { status: 400 }
        )
      }
    }

    // Calculate discount
    let discountCents: number
    if (promo.discount_type === 'percentage') {
      const base = promo.scope === 'delivery' ? deliveryFeeCents : subtotalCents
      discountCents = Math.round(base * (promo.discount_value / 100))
    } else {
      discountCents = promo.discount_value
    }

    // Apply clamp
    const base = promo.scope === 'delivery' ? deliveryFeeCents : subtotalCents
    const maxCap = promo.max_discount_cents ?? base
    discountCents = Math.min(discountCents, maxCap, base)

    return NextResponse.json({
      valid: true,
      promoCode: promo.code,
      description: promo.description,
      scope: promo.scope,
      discountType: promo.discount_type,
      discountValue: promo.discount_value,
      discountCents,
      maxDiscountCents: promo.max_discount_cents,
    })
  } catch (error) {
    console.error('[API] /api/checkout/validate-promo:', error)
    return NextResponse.json(
      { valid: false, error: 'Unable to validate promo code', code: 'VALIDATION_FAILED' },
      { status: 500 }
    )
  }
}
