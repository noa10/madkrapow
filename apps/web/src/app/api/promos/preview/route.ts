import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { computePerItemDiscount } from '@/lib/services/promo-calculator'

const PreviewRequestSchema = z.object({
  itemId: z.string().min(1),
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

    // ── Phase 1: item-targeted promos (promo_items!inner) ──────────
    const { data: targetedPromos, error: targetedError } = await supabase
      .from('promo_codes')
      .select('*, promo_items!inner(menu_item_id, role)')
      .eq('promo_items.menu_item_id', itemId)
      .eq('promo_items.role', 'target')
      .eq('is_active', true)
      .eq('application_type', 'auto')
      .eq('scope', 'order')
      .gte('valid_until', now)
      .lte('valid_from', now)

    // ── Phase 2: order-scoped auto promos with NO promo_items (apply to all items) ──
    const { data: globalPromos, error: globalError } = await supabase
      .from('promo_codes')
      .select('*, promo_items(menu_item_id, role)')
      .eq('is_active', true)
      .eq('application_type', 'auto')
      .eq('scope', 'order')
      .gte('valid_until', now)
      .lte('valid_from', now)

    // Filter global promos to those with zero promo_items rows (i.e. apply to all items)
    const unscopedGlobal = (globalPromos ?? []).filter(
      p => !p.promo_items || p.promo_items.length === 0
    )

    const allPromos = [
      ...(targetedPromos ?? []),
      ...unscopedGlobal,
    ]

    if ((targetedError && globalError) || allPromos.length === 0) {
      return NextResponse.json({ previews: [] }, { status: 200 })
    }

    // Filter by usage limits and min order amount
    const eligible = allPromos.filter(p => {
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
    const discountCents = computePerItemDiscount(bestPromo, originalPriceCents)

    const previews = [{
      promoCode: bestPromo.code,
      discountedCents: originalPriceCents - discountCents,
      originalCents: originalPriceCents,
      savingsCents: discountCents,
      discountType: bestPromo.discount_type,
      scope: bestPromo.scope,
    }]

    return NextResponse.json({ previews }, { status: 200 })
  } catch (error) {
    console.error('[API] /api/promos/preview:', error)
    return NextResponse.json(
      { error: 'Unable to fetch promo preview', code: 'PREVIEW_FAILED' },
      { status: 500 }
    )
  }
}
