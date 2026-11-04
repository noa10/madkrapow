import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/server'
import { authenticatePartnerRequest } from '@/lib/grabfood/partner-auth'
import { requireGrabFoodEnabled, validatePersistedOutlet } from '@/lib/grabfood/guard'
import { buildGrabMenu, type MenuCategoryRow, type MenuItemRow } from '@/lib/grabfood/menu-builder'
import type { GrabMenuPayload } from '@/lib/grabfood/types'

export const dynamic = 'force-dynamic'

/**
 * Get Menu webhook (Grab -> POS).
 *
 * Grab calls this during self-serve activation and after a menu-update
 * notification. The response is built from the local catalogue and the
 * channel_products/channel_categories mappings; only mapped, active
 * categories/items are emitted.
 *
 * merchantID is not required here: Grab documents that it may first be
 * revealed in this request's query during activation.
 */
export async function GET(req: NextRequest) {
  const disabled = requireGrabFoodEnabled()
  if (disabled) {
    return NextResponse.json({ error: disabled.error }, { status: disabled.status })
  }

  const auth = authenticatePartnerRequest(
    { headers: req.headers },
    { scope: 'food.partner_api' }
  )
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(req.url)
  const merchantID = searchParams.get('merchantID')
  const partnerMerchantID = searchParams.get('partnerMerchantID')

  const supabase = getServiceClient()
  const outlet = await validatePersistedOutlet(
    supabase,
    { merchantID, partnerMerchantID },
    { requireMerchant: false, allowUnknownMerchant: true }
  )
  if (!outlet.ok) {
    return NextResponse.json({ error: outlet.error }, { status: outlet.status })
  }

  const [{ data: categories, error: categoryError }, { data: items, error: itemError }] =
    await Promise.all([
      supabase
        .from('categories')
        .select('id, name, sort_order, is_active, channel_categories(channel, external_category_id)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase.from('menu_items').select(`
          id, category_id, name, description, price_cents, image_url, is_available,
          snooze_till, sort_order,
          channel_products(channel, external_item_id, external_name, price_cents, is_available, snooze_till),
          menu_item_modifier_groups(
            modifier_groups(
              id, name, min_selections, max_selections, sort_order,
              modifiers(id, name, price_delta_cents, is_available, sort_order, channel_modifiers(channel, price_cents))
            )
          )
        `),
    ])

  if (categoryError || itemError) {
    console.error('[GrabFood] Get Menu query failed:', categoryError?.message ?? itemError?.message)
    return NextResponse.json({ error: 'Failed to build menu' }, { status: 500 })
  }

  const itemsByCategory = new Map<string, MenuItemRow[]>()
  for (const item of (items ?? []) as unknown as Array<MenuItemRow & { category_id: string }>) {
    const list = itemsByCategory.get(item.category_id) ?? []
    list.push(item)
    itemsByCategory.set(item.category_id, list)
  }

  const rows = ((categories ?? []) as unknown as MenuCategoryRow[]).map((category) => ({
    ...category,
    menu_items: itemsByCategory.get(category.id) ?? [],
  }))

  const menu: GrabMenuPayload = buildGrabMenu(rows, {
    merchantId: merchantID,
    partnerMerchantId: partnerMerchantID ?? process.env.GRABFOOD_PARTNER_MERCHANT_ID ?? null,
  })

  // Record the Grab/POS mapping revealed during activation. Failure to write
  // this is not fatal for the menu response; the integration-status webhook
  // will write it too.
  if (merchantID && partnerMerchantID) {
    const { error: mapError } = await supabase.from('grabfood_integrations').upsert(
      {
        partner_merchant_id: partnerMerchantID,
        grab_merchant_id: merchantID,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'partner_merchant_id' }
    )
    if (mapError) {
      console.error('[GrabFood] Get Menu mapping write failed:', mapError.message)
    }
  }

  return NextResponse.json(menu, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
