import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { computePerItemDiscount } from '@/lib/services/promo-calculator'

const PreviewRequestSchema = z.object({
  itemId: z.string().uuid(),
  cartSubtotalCents: z.number().int().nonnegative().optional().default(0),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = PreviewRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const { itemId, cartSubtotalCents } = parsed.data
    const supabase = getServiceClient()
    const now = new Date().toISOString()

    // Fetch the menu item's base price
    const { data: menuItem, error: itemError } = await supabase
      .from('menu_items')
      .select('id, price_cents, is_available')
      .eq('id', itemId)
      .single()

    if (itemError || !menuItem) {
      return NextResponse.json(
        { error: 'Menu item not found', code: 'ITEM_NOT_FOUND' },
        { status: 404 }
      )
    }

    if (!menuItem.is_available) {
      return NextResponse.json({ previews: [] }, { status: 200 })
    }

    // Fetch active auto promos with their target items in a single batched join
    const { data: promos, error: promosError } = await supabase
      .from('promo_codes')
      .select('*, promo_items!inner(menu_item_id, role)')
      .eq('promo_items.menu_item_id', itemId)
      .eq('promo_items.role', 'target')
      .eq('is_active', true)
      .eq('application_type', 'auto')
      .eq('scope', 'order')
      .gte('valid_until', now)
      .lte('valid_from', now)

    if (promosError || !promos || promos.length === 0) {
      return NextResponse.json({ previews: [] }, { status: 200 })
    }

    // Filter by usage limits and min order amount
    const eligible = promos.filter(p => {
      if (p.max_uses !== null && p.current_uses >= p.max_uses) return false
      // Only check min_order when cart has items (nonzero subtotal)
      if (cartSubtotalCents > 0 && p.min_order_amount_cents) {
        if (cartSubtotalCents < p.min_order_amount_cents) return false
      }
      return true
    })

    // Pick the highest-value eligible promo (matching existing stacking rule)
    if (eligible.length === 0) {
      return NextResponse.json({ previews: [] }, { status: 200 })
    }

    const bestPromo = eligible.reduce((prev, curr) =>
      curr.discount_value > prev.discount_value ? curr : prev
    )

    const originalPriceCents = menuItem.price_cents
    const previews = []

    if (bestPromo.discount_type === 'percentage') {
      const discountCents = computePerItemDiscount(bestPromo, originalPriceCents)
      previews.push({
        promoCode: bestPromo.code,
        discountedCents: originalPriceCents - discountCents,
        originalCents: originalPriceCents,
        savingsCents: discountCents,
        discountType: 'percentage' as const,
      })
    } else {
      // FIXED promo: no per-item price change — badge only
      previews.push({
        promoCode: bestPromo.code,
        discountedCents: originalPriceCents,
        originalCents: originalPriceCents,
        savingsCents: 0,
        discountType: 'fixed' as const,
        badge: 'Promo active',
      })
    }

    return NextResponse.json({ previews }, { status: 200 })
  } catch (error) {
    console.error('[API] /api/promos/preview:', error)
    return NextResponse.json(
      { error: 'Unable to fetch promo preview', code: 'PREVIEW_FAILED' },
      { status: 500 }
    )
  }
}
