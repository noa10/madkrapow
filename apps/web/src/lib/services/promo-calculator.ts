import { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@madkrapow/shared-types'

type PromoCode = Database['public']['Tables']['promo_codes']['Row']

interface PromoApplication {
  promoCode: PromoCode
  discountCents: number
}

interface CartInput {
  subtotalCents: number
  deliveryFeeCents: number
  orderItemIds?: string[]
  orderItemMenuIds?: string[]
  orderItemQuantities?: number[]
  orderItemPrices?: number[]
}

/**
 * Server-side promo calculation engine.
 *
 * Stacking rules:
 * - One promo per scope category (order, delivery, item, free_item, bundle)
 * - Within a category, the highest-value promo wins
 * - Discount total cannot exceed base amount (no negative orders)
 */
export async function calculatePromos(
  supabase: SupabaseClient,
  cart: CartInput,
  promoCodes?: string[]
): Promise<{ applied: PromoApplication[]; totalDiscountCents: number }> {
  const now = new Date().toISOString()

  // Build query for auto-applied promos
  let query = supabase
    .from('promo_codes')
    .select('*')
    .eq('is_active', true)
    .gte('valid_until', now)
    .lte('valid_from', now)
    .order('discount_value', { ascending: false })

  // If specific codes requested, filter to those
  if (promoCodes && promoCodes.length > 0) {
    const lowerCodes = promoCodes.map(c => c.toLowerCase())
    query = query.in('code', lowerCodes)
  } else {
    // Auto-apply only
    query = query.eq('application_type', 'auto')
  }

  const { data: promos, error } = await query
  if (error || !promos) return { applied: [], totalDiscountCents: 0 }

  // Group by scope and pick the best per category
  const bestByScope = new Map<string, PromoCode>()
  for (const promo of promos) {
    if (
      !bestByScope.has(promo.scope) ||
      promo.discount_value > bestByScope.get(promo.scope)!.discount_value
    ) {
      bestByScope.set(promo.scope, promo)
    }
  }

  // Calculate discounts per scope
  const applied: PromoApplication[] = []

  for (const promo of bestByScope.values()) {
    // Check usage limits
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) continue

    // Check min order amount
    if (promo.min_order_amount_cents) {
      if (cart.subtotalCents < promo.min_order_amount_cents) continue
    }

    const discountCents = computeDiscount(promo, cart)
    if (discountCents > 0) {
      applied.push({ promoCode: promo, discountCents })
    }
  }

  const totalDiscountCents = applied.reduce((sum, a) => sum + a.discountCents, 0)

  return { applied, totalDiscountCents }
}

function computeDiscount(
  promo: PromoCode,
  cart: CartInput
): number {
  let base: number
  let calculated: number

  switch (promo.scope) {
    case 'order':
      base = cart.subtotalCents
      calculated = promo.discount_type === 'percentage'
        ? Math.round(base * (promo.discount_value / 100))
        : promo.discount_value
      break

    case 'delivery':
      base = cart.deliveryFeeCents
      if (base === 0) return 0
      calculated = promo.discount_type === 'percentage'
        ? Math.round(base * (promo.discount_value / 100))
        : promo.discount_value
      break

    case 'item':
    case 'free_item':
    case 'bundle':
      // Phase 2 — skip for now
      return 0

    default:
      return 0
  }

  // Three-argument clamp: min(calculated, max_discount_cents ?? base, base)
  const maxCap = promo.max_discount_cents ?? base
  return Math.min(calculated, maxCap, base)
}

/**
 * Compute per-item discount for a PERCENTAGE promo.
 * Only used for menu-level display — fixed discounts are order-level only.
 */
export function computePerItemDiscount(
  promo: Pick<PromoCode, 'discount_type' | 'discount_value' | 'max_discount_cents'>,
  originalPriceCents: number,
): number {
  if (promo.discount_type !== 'percentage') return 0

  const discount = Math.round(originalPriceCents * (promo.discount_value / 100))
  const maxCap = promo.max_discount_cents ?? originalPriceCents
  return Math.min(discount, maxCap, originalPriceCents)
}
