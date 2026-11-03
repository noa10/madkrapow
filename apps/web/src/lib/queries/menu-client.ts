import { getBrowserClient } from '@/lib/supabase/client'

const supabase = getBrowserClient()

const MENU_ITEMS_CACHE_TTL_MS = 5 * 60 * 1000

const MENU_ITEM_COLUMNS =
  'id, category_id, name, slug, description, price_cents, image_url, is_available, sort_order, created_at, updated_at'
const MODIFIER_GROUP_COLUMNS =
  'id, name, description, min_selections, max_selections, sort_order, created_at, updated_at'
const MODIFIER_COLUMNS =
  'id, modifier_group_id, name, price_delta_cents, is_default, is_available, sort_order, created_at, updated_at'

export type Category = {
  id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type MenuItem = {
  id: string
  category_id: string
  name: string
  slug: string
  description: string | null
  price_cents: number
  image_url: string | null
  is_available: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type ModifierGroup = {
  id: string
  name: string
  description: string | null
  min_selections: number
  max_selections: number
  sort_order: number
  created_at: string
  updated_at: string
}

export type Modifier = {
  id: string
  modifier_group_id: string
  name: string
  price_delta_cents: number
  is_default: boolean
  is_available: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type MenuItemWithModifierGroups = MenuItem & {
  modifier_groups: (ModifierGroup & { is_required: boolean })[]
}

export type FullMenuItem = MenuItem & {
  category: Pick<Category, 'id' | 'name'>
  modifier_groups: (ModifierGroup & { is_required: boolean; modifiers: Modifier[] })[]
}

interface MenuItemsCacheEntry {
  items: MenuItemWithModifierGroups[]
  expiresAt: number
}

let menuItemsCache: MenuItemsCacheEntry | null = null
let menuItemsInFlight: Promise<MenuItemWithModifierGroups[]> | null = null

type HydratedModifierGroup = ModifierGroup & { is_required: boolean; modifiers: Modifier[] }

type MenuItemRow = MenuItem & {
  menu_item_modifier_groups:
    | {
        is_required: boolean
        group: (ModifierGroup & { modifiers: Modifier[] | null }) | null
      }[]
    | null
}

/**
 * One round trip instead of three (two parallel, then groups, then modifiers).
 * Checkout calls this with `maxAgeMs: 0`, so its cost is paid on every
 * checkout mount while the skeleton is on screen: ~1.1s from Malaysia as three
 * serial queries, ~0.3s as one nested select.
 */
async function fetchMenuItems(): Promise<MenuItemWithModifierGroups[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select(
      `${MENU_ITEM_COLUMNS},menu_item_modifier_groups(is_required,group:modifier_groups(${MODIFIER_GROUP_COLUMNS},modifiers(${MODIFIER_COLUMNS})))`
    )
    .order('sort_order', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as MenuItemRow[]

  return rows.map(({ menu_item_modifier_groups, ...item }) => ({
    ...item,
    modifier_groups: (menu_item_modifier_groups ?? [])
      .map((link) => {
        const group = link.group
        if (!group) return null
        const { modifiers, ...groupFields } = group
        return {
          ...groupFields,
          is_required: link.is_required,
          modifiers: [...(modifiers ?? [])]
            .filter((modifier) => modifier.is_available)
            .sort((a, b) => a.sort_order - b.sort_order),
        }
      })
      .filter((group): group is HydratedModifierGroup => group !== null)
      .sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export interface GetMenuItemsOptions {
  /**
   * How long a cached result may be reused (defaults to the short menu TTL).
   * Pass `0` on money-displaying surfaces such as checkout so prices and
   * availability are re-read from the database rather than served from cache.
   */
  maxAgeMs?: number
}

export async function getMenuItems(
  options: GetMenuItemsOptions = {}
): Promise<MenuItemWithModifierGroups[]> {
  const maxAgeMs = options.maxAgeMs ?? MENU_ITEMS_CACHE_TTL_MS

  if (maxAgeMs > 0 && menuItemsCache && menuItemsCache.expiresAt > Date.now()) {
    return menuItemsCache.items
  }

  if (menuItemsInFlight) {
    return menuItemsInFlight
  }

  const request = fetchMenuItems()
    .then((items) => {
      // Even a forced read refreshes the shared cache for the next consumer.
      menuItemsCache = {
        items,
        expiresAt: Date.now() + MENU_ITEMS_CACHE_TTL_MS,
      }
      return items
    })
    .finally(() => {
      if (menuItemsInFlight === request) {
        menuItemsInFlight = null
      }
    })

  menuItemsInFlight = request
  return request
}
