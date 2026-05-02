import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
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
    const supabase = getServiceClient()
    const now = new Date().toISOString()

    // Fetch active auto-applied promos with their target items in a single batched join
    const { data: promos, error } = await supabase
      .from('promo_codes')
      .select('*, promo_items(menu_item_id, role)')
      .eq('application_type', 'auto')
      .eq('is_active', true)
      .gte('valid_until', now)
      .lte('valid_from', now)

    if (error || !promos) {
      return NextResponse.json({ applied: [] }, { status: 200 })
    }

    const applied = promos
      .filter(p => {
        // Check usage limits
        if (p.max_uses !== null && p.current_uses >= p.max_uses) return false

        // Check min order amount — skip when subtotal is 0 (menu-level display)
        if (p.min_order_amount_cents && subtotalCents > 0) {
          const base = p.scope === 'delivery' ? deliveryFeeCents : subtotalCents
          if (base < p.min_order_amount_cents) return false
        }

        return true
      })
      .map(p => {
        const base = p.scope === 'delivery' ? deliveryFeeCents : subtotalCents
        let discountCents = p.discount_type === 'percentage'
          ? Math.round(base * (p.discount_value / 100))
          : p.discount_value

        // Clamp
        const maxCap = p.max_discount_cents ?? base
        discountCents = Math.min(discountCents, maxCap, base)

        // Extract target item IDs from the joined promo_items
        const targetItemIds = (p.promo_items as Array<{ menu_item_id: string; role: string }>)
          .filter(pi => pi.role === 'target')
          .map(pi => pi.menu_item_id)

        return {
          code: p.code,
          description: p.description,
          scope: p.scope,
          discountType: p.discount_type,
          discountValue: p.discount_value,
          discountCents,
          targetItemIds,
          minOrderCents: p.min_order_amount_cents,
          validFrom: p.valid_from,
          validUntil: p.valid_until,
        }
      })

    return NextResponse.json({ applied }, { status: 200 })
  } catch (error) {
    console.error('[API] /api/promos/auto:', error)
    return NextResponse.json(
      { error: 'Unable to fetch auto-promos', code: 'AUTO_PROMO_FAILED' },
      { status: 500 }
    )
  }
}
