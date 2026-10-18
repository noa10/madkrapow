import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { computePerItemDiscount } from '@/lib/services/promo-calculator'
import type { Database } from '@madkrapow/shared-types'

type PromoCodeRow = Database['public']['Tables']['promo_codes']['Row']
type PromoItemRef = Pick<Database['public']['Tables']['promo_items']['Row'], 'menu_item_id' | 'role'>
type PromoWithItems = PromoCodeRow & { promo_items?: PromoItemRef[] | null }
type MenuItemPreviewRow = Pick<
  Database['public']['Tables']['menu_items']['Row'],
  'id' | 'price_cents' | 'is_available'
>

interface PromoPreview {
  promoCode: string
  discountedCents: number
  originalCents: number
  savingsCents: number
  discountType: string
  scope: string
}

const PreviewRequestSchema = z
  .object({
    itemId: z.string().min(1).optional(),
    itemIds: z.array(z.string().min(1)).max(100).optional(),
    cartSubtotalCents: z.number().int().nonnegative().optional().default(0),
  })
  .refine(
    (data) => Boolean(data.itemId) || (data.itemIds !== undefined && data.itemIds.length > 0),
    { message: 'itemId or itemIds is required' }
  )

function buildPreviewsForItem(
  item: MenuItemPreviewRow,
  targetedPromos: PromoWithItems[],
  globalPromos: PromoWithItems[],
  cartSubtotalCents: number
): PromoPreview[] {
  if (!item.is_available) return []

  const allPromos = [...targetedPromos, ...globalPromos]
  if (allPromos.length === 0) return []

  // Filter by usage limits and min order amount
  const eligible = allPromos.filter((p) => {
    if (p.max_uses !== null && p.current_uses >= p.max_uses) return false
    // Only check min_order when cart has items (nonzero subtotal)
    if (cartSubtotalCents > 0 && p.min_order_amount_cents) {
      if (cartSubtotalCents < p.min_order_amount_cents) return false
    }
    return true
  })

  // Pick the highest-value eligible promo (matching existing stacking rule)
  if (eligible.length === 0) return []

  const bestPromo = eligible.reduce((prev, curr) =>
    curr.discount_value > prev.discount_value ? curr : prev
  )

  const originalPriceCents = item.price_cents
  const discountCents = computePerItemDiscount(bestPromo, originalPriceCents)

  return [{
    promoCode: bestPromo.code,
    discountedCents: originalPriceCents - discountCents,
    originalCents: originalPriceCents,
    savingsCents: discountCents,
    discountType: bestPromo.discount_type,
    scope: bestPromo.scope,
  }]
}

function emptyResponseBody(itemId: string | undefined, batchIds: string[]) {
  const body: {
    previews?: PromoPreview[]
    previewsByItem?: Record<string, PromoPreview[]>
  } = {}

  if (itemId) body.previews = []
  if (batchIds.length > 0) {
    const previewsByItem: Record<string, PromoPreview[]> = {}
    for (const id of batchIds) previewsByItem[id] = []
    body.previewsByItem = previewsByItem
  }

  return body
}

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

    const { itemId, itemIds, cartSubtotalCents } = parsed.data
    const batchIds = itemIds ? [...new Set(itemIds)] : []
    const requestedIds = [...new Set([...(itemId ? [itemId] : []), ...batchIds])]

    const supabase = getServiceClient()
    const now = new Date().toISOString()

    // Fetch base prices/availability for every requested item in ONE query.
    const { data: menuItems, error: itemError } = await supabase
      .from('menu_items')
      .select('id, price_cents, is_available')
      .in('id', requestedIds)

    if (itemError) {
      if (itemId) {
        return NextResponse.json(
          { error: 'Menu item not found', code: 'ITEM_NOT_FOUND' },
          { status: 404 }
        )
      }
      throw itemError
    }

    const itemsById = new Map<string, MenuItemPreviewRow>(
      ((menuItems ?? []) as MenuItemPreviewRow[]).map((item) => [item.id, item])
    )

    if (itemId && !itemsById.has(itemId)) {
      return NextResponse.json(
        { error: 'Menu item not found', code: 'ITEM_NOT_FOUND' },
        { status: 404 }
      )
    }

    const availableIds = requestedIds.filter((id) => itemsById.get(id)?.is_available)

    // Nothing to price (missing or unavailable items): skip promo queries entirely.
    if (availableIds.length === 0) {
      return NextResponse.json(emptyResponseBody(itemId, batchIds), { status: 200 })
    }

    // ── Phase 1: item-targeted promos (promo_items!inner) ──────────
    // ── Phase 2: order-scoped auto promos with NO promo_items (apply to all items) ──
    const [targetedResult, globalResult] = await Promise.all([
      supabase
        .from('promo_codes')
        .select('*, promo_items!inner(menu_item_id, role)')
        .in('promo_items.menu_item_id', availableIds)
        .eq('promo_items.role', 'target')
        .eq('is_active', true)
        .eq('application_type', 'auto')
        .eq('scope', 'order')
        .gte('valid_until', now)
        .lte('valid_from', now),
      supabase
        .from('promo_codes')
        .select('*, promo_items(menu_item_id, role)')
        .eq('is_active', true)
        .eq('application_type', 'auto')
        .eq('scope', 'order')
        .gte('valid_until', now)
        .lte('valid_from', now),
    ])

    const { data: targetedPromosData, error: targetedError } = targetedResult
    const { data: globalPromosData, error: globalError } = globalResult

    // Map each targeted promo to the requested items it actually targets.
    const targetedByItem = new Map<string, PromoWithItems[]>()
    if (!targetedError) {
      const availableIdSet = new Set(availableIds)
      for (const promo of (targetedPromosData ?? []) as PromoWithItems[]) {
        const seenItemIds = new Set<string>()
        for (const ref of promo.promo_items ?? []) {
          if (ref.role !== 'target' || !availableIdSet.has(ref.menu_item_id)) continue
          if (seenItemIds.has(ref.menu_item_id)) continue
          seenItemIds.add(ref.menu_item_id)

          const itemPromos = targetedByItem.get(ref.menu_item_id)
          if (itemPromos) {
            itemPromos.push(promo)
          } else {
            targetedByItem.set(ref.menu_item_id, [promo])
          }
        }
      }
    }

    // Filter global promos to those with zero promo_items rows (i.e. apply to all items)
    const unscopedGlobal = globalError
      ? []
      : ((globalPromosData ?? []) as PromoWithItems[]).filter(
          (p) => !p.promo_items || p.promo_items.length === 0
        )

    const responseBody: {
      previews?: PromoPreview[]
      previewsByItem?: Record<string, PromoPreview[]>
    } = {}

    // Single-item form keeps its existing `{ previews }` response shape.
    if (itemId) {
      const item = itemsById.get(itemId)
      if (item) {
        responseBody.previews = buildPreviewsForItem(
          item,
          targetedByItem.get(itemId) ?? [],
          unscopedGlobal,
          cartSubtotalCents
        )
      }
    }

    // Batched form returns previews keyed by item id.
    if (batchIds.length > 0) {
      const previewsByItem: Record<string, PromoPreview[]> = {}
      for (const id of batchIds) {
        const item = itemsById.get(id)
        previewsByItem[id] = item
          ? buildPreviewsForItem(
              item,
              targetedByItem.get(id) ?? [],
              unscopedGlobal,
              cartSubtotalCents
            )
          : []
      }
      responseBody.previewsByItem = previewsByItem
    }

    return NextResponse.json(responseBody, { status: 200 })
  } catch (error) {
    console.error('[API] /api/promos/preview:', error)
    return NextResponse.json(
      { error: 'Unable to fetch promo preview', code: 'PREVIEW_FAILED' },
      { status: 500 }
    )
  }
}
