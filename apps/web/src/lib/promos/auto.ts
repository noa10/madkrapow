import type { SupabaseClient } from '@supabase/supabase-js'

export interface AutoAppliedPromo {
  code: string
  description: string | null
  scope: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  discountCents: number
  targetItemIds: string[]
  minOrderCents: number | null
  validFrom: string
  validUntil: string
}

/** The promo query itself failed; callers may retry or flag degraded data. */
export class AutoPromoQueryError extends Error {
  constructor(message = 'Unable to load auto-promos') {
    super(message)
    this.name = 'AutoPromoQueryError'
  }
}

interface PromoRow {
  code: string
  description: string | null
  scope: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  max_discount_cents: number | null
  min_order_amount_cents: number | null
  max_uses: number | null
  current_uses: number
  valid_from: string
  valid_until: string
  promo_items: Array<{ menu_item_id: string; role: string }>
}

/**
 * Active auto-applied promos for a cart, priced against the supplied subtotal
 * and delivery fee. A promo query failure returns an empty list: checkout
 * must still render, just without an automatic discount.
 */
export async function getAutoAppliedPromos(
  supabase: SupabaseClient,
  subtotalCents: number,
  deliveryFeeCents: number,
): Promise<AutoAppliedPromo[]> {
  const now = new Date().toISOString()

  const { data: promos, error } = await supabase
    .from('promo_codes')
    .select('*, promo_items(menu_item_id, role)')
    .eq('application_type', 'auto')
    .eq('is_active', true)
    .gte('valid_until', now)
    .lte('valid_from', now)

  if (error || !promos) {
    if (error) {
      console.error('[API] /api/promos/auto query failed:', error)
    }
    throw new AutoPromoQueryError()
  }

  return (promos as PromoRow[])
    .filter((promo) => {
      // Check usage limits
      if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
        return false
      }

      // Check min order amount — skip when subtotal is 0 (menu-level display)
      if (promo.min_order_amount_cents && subtotalCents > 0) {
        const base =
          promo.scope === 'delivery' ? deliveryFeeCents : subtotalCents
        if (base < promo.min_order_amount_cents) return false
      }

      return true
    })
    .map((promo) => {
      const base =
        promo.scope === 'delivery' ? deliveryFeeCents : subtotalCents
      let discountCents =
        promo.discount_type === 'percentage'
          ? Math.round(base * (promo.discount_value / 100))
          : promo.discount_value

      // Clamp
      const maxCap = promo.max_discount_cents ?? base
      discountCents = Math.min(discountCents, maxCap, base)

      const targetItemIds = (promo.promo_items ?? [])
        .filter((item) => item.role === 'target')
        .map((item) => item.menu_item_id)

      return {
        code: promo.code,
        description: promo.description,
        scope: promo.scope,
        discountType: promo.discount_type,
        discountValue: promo.discount_value,
        discountCents,
        targetItemIds,
        minOrderCents: promo.min_order_amount_cents,
        validFrom: promo.valid_from,
        validUntil: promo.valid_until,
      }
    })
}
