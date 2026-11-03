/**
 * Build the menu Grab pulls from Get Menu.
 *
 * The POS owns the integrated menu: local product IDs are the canonical
 * modifier IDs, while items use the channel_products.external_item_id that
 * Grab assigned. That keeps order callbacks (`items[].id`,
 * `modifiers[].id`) mapped to stable identifiers without a second mapping
 * table.
 *
 * Items require a GrabFood mapping. Categories use the mapped ID when present,
 * otherwise their stable local category UUID. Selling
 * times use one all-day window because the local catalogue has no
 * channel-specific selling-time model yet; Grab accepts 1..20 sellingTimes.
 */

import type {
  GrabMenuCategory,
  GrabMenuItem,
  GrabMenuModifier,
  GrabMenuPayload,
  GrabModifierGroup,
  GrabServiceHours,
  GrabSellingTime,
} from './types'
import { grabAvailableStatusFor, type GrabMenuMappingRow } from './menu'

export const ALL_DAY_SELLING_TIME_ID = 'all-day'

export interface MenuModifierRow {
  id: string
  name: string
  price_delta_cents: number
  is_available: boolean
  sort_order: number
}

export interface MenuModifierGroupRow {
  id: string
  name: string
  min_selections: number
  max_selections: number
  sort_order: number
  modifiers?: MenuModifierRow[]
}

export interface MenuChannelProductRow {
  channel: string
  external_item_id: string | null
  external_name: string | null
  price_cents: number | null
  is_available: boolean
  snooze_till: string | null
}

export interface MenuItemRow {
  id: string
  name: string
  description: string | null
  price_cents: number
  image_url: string | null
  is_available: boolean
  snooze_till: string | null
  sort_order: number
  channel_products?: MenuChannelProductRow[] | MenuChannelProductRow | null
  menu_item_modifier_groups?: Array<{
    modifier_groups: MenuModifierGroupRow | MenuModifierGroupRow[] | null
  }> | null
}

export interface MenuCategoryRow {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  channel_categories?: Array<{ channel: string; external_category_id: string | null }> | null
  menu_items?: MenuItemRow[] | null
}

const MENU_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export function allDaySellingTime(): GrabSellingTime {
  const serviceHours = Object.fromEntries(
    MENU_DAYS.map((day) => [day, { openPeriodType: 'OpenAllDay' as const }])
  ) as GrabServiceHours
  return {
    id: ALL_DAY_SELLING_TIME_ID,
    name: 'All Day',
    // UTC per Grab's menu schema. Wide enough to cover any staging fixture.
    startTime: '2020-01-01 00:00:00',
    endTime: '2035-12-31 23:59:59',
    serviceHours,
  }
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function grabMapping(item: MenuItemRow): MenuChannelProductRow | null {
  return asArray(item.channel_products).find((row) => row.channel === 'grabfood') ?? null
}

function isPublicImage(url: string | null | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url))
}

function buildModifierGroups(item: MenuItemRow): GrabModifierGroup[] {
  return asArray(item.menu_item_modifier_groups)
    .flatMap((link) => asArray(link.modifier_groups))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((group) => {
      const modifiers: GrabMenuModifier[] = asArray(group.modifiers)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((modifier) => ({
          id: modifier.id,
          name: modifier.name,
          availableStatus: modifier.is_available ? 'AVAILABLE' : 'UNAVAILABLE',
          price: modifier.price_delta_cents,
          sequence: modifier.sort_order,
        }))
      return {
        id: group.id,
        name: group.name,
        availableStatus: modifiers.some((m) => m.availableStatus === 'AVAILABLE')
          ? 'AVAILABLE'
          : 'UNAVAILABLE',
        selectionRangeMin: group.min_selections,
        selectionRangeMax: group.max_selections,
        sequence: group.sort_order,
        modifiers,
      }
    })
}

function buildItem(item: MenuItemRow, mapping: MenuChannelProductRow): GrabMenuItem {
  const availability: GrabMenuMappingRow = {
    channel_product_id: '',
    menu_item_id: item.id,
    menu_item_name: item.name,
    menu_item_price_cents: item.price_cents,
    menu_item_is_available: item.is_available,
    menu_item_snooze_till: item.snooze_till,
    external_item_id: mapping.external_item_id,
    external_name: mapping.external_name,
    channel_price_cents: mapping.price_cents,
    channel_is_available: mapping.is_available,
    channel_snooze_till: mapping.snooze_till,
  }
  const availableStatus = grabAvailableStatusFor(availability)
  const menuItem: GrabMenuItem = {
    id: mapping.external_item_id as string,
    name: mapping.external_name ?? item.name,
    availableStatus,
    price: mapping.price_cents ?? item.price_cents,
    // `taxable` is Indonesia-only. Malaysia rejects it with INVALID_TAXABLE_COUNTRY.
    sequence: item.sort_order,
  }
  if (item.description) menuItem.description = item.description
  if (isPublicImage(item.image_url)) menuItem.photos = [item.image_url]
  if (availableStatus === 'UNAVAILABLE') menuItem.maxStock = 0
  const modifierGroups = buildModifierGroups(item)
  if (modifierGroups.length > 0) menuItem.modifierGroups = modifierGroups
  return menuItem
}

/**
 * Build the full Get Menu response from joined catalogue rows.
 * `merchantID` is intentionally optional: during self-serve activation Grab
 * first reveals it in the Get Menu query, so it may be absent in stored rows.
 */
export function buildGrabMenu(
  categories: MenuCategoryRow[],
  options: { merchantId?: string | null; partnerMerchantId?: string | null } = {}
): GrabMenuPayload {
  const built: GrabMenuCategory[] = categories
    .filter((category) => category.is_active)
    .map((category) => {
      const externalCategoryId = asArray(category.channel_categories).find(
        (row) => row.channel === 'grabfood'
      )?.external_category_id

      const items = asArray(category.menu_items)
        .filter((item) => Boolean(grabMapping(item)?.external_item_id))
        .map((item) => {
          const mapping = grabMapping(item)
          return mapping?.external_item_id ? buildItem(item, mapping) : null
        })
        .filter((item): item is GrabMenuItem => item !== null)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))

      if (items.length === 0) return null

      const menuCategory: GrabMenuCategory = {
        id: externalCategoryId || category.id,
        name: category.name,
        availableStatus: items.some((item) => item.availableStatus === 'AVAILABLE')
          ? 'AVAILABLE'
          : 'UNAVAILABLE',
        sellingTimeID: ALL_DAY_SELLING_TIME_ID,
        sequence: category.sort_order,
        items,
      }
      return menuCategory
    })
    .filter((category): category is GrabMenuCategory => category !== null)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))

  return {
    ...(options.merchantId ? { merchantID: options.merchantId } : {}),
    ...(options.partnerMerchantId ? { partnerMerchantID: options.partnerMerchantId } : {}),
    currency: { code: 'MYR', symbol: 'RM', exponent: 2 },
    sellingTimes: [allDaySellingTime()],
    categories: built,
  }
}
