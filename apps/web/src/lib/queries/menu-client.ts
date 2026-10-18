import { getBrowserClient } from '@/lib/supabase/client'

const supabase = getBrowserClient()

const MENU_ITEMS_CACHE_TTL_MS = 5 * 60 * 1000

const MENU_ITEM_COLUMNS =
  'id, category_id, name, slug, description, price_cents, image_url, is_available, sort_order, created_at, updated_at'
const MENU_ITEM_MODIFIER_GROUP_COLUMNS = 'menu_item_id, modifier_group_id, is_required'
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

async function fetchMenuItems(): Promise<MenuItemWithModifierGroups[]> {
  const [
    { data: menuItems, error },
    { data: menuItemModifierGroups, error: migError },
  ] = await Promise.all([
    supabase
      .from('menu_items')
      .select(MENU_ITEM_COLUMNS)
      .order('sort_order', { ascending: true }),
    supabase
      .from('menu_item_modifier_groups')
      .select(MENU_ITEM_MODIFIER_GROUP_COLUMNS),
  ])

  if (error) throw error
  if (migError) throw migError

  const modifierGroupIds = [...new Set(menuItemModifierGroups.map((m: { modifier_group_id: string }) => m.modifier_group_id))]

  if (modifierGroupIds.length === 0) {
    return menuItems.map((item: MenuItem) => ({ ...item, modifier_groups: [] }))
  }

  const { data: modifierGroups, error: mgError } = await supabase
    .from('modifier_groups')
    .select(MODIFIER_GROUP_COLUMNS)
    .in('id', modifierGroupIds)
    .order('sort_order', { ascending: true })

  if (mgError) throw mgError

  const modifierGroupIdList = modifierGroups.map((g: ModifierGroup) => g.id)

  const { data: modifiers, error: modError } = await supabase
    .from('modifiers')
    .select(MODIFIER_COLUMNS)
    .in('modifier_group_id', modifierGroupIdList)
    .eq('is_available', true)
    .order('sort_order', { ascending: true })

  if (modError) throw modError

  const modifiersByGroup = modifiers.reduce((acc: Record<string, Modifier[]>, mod: Modifier) => {
    if (!acc[mod.modifier_group_id]) acc[mod.modifier_group_id] = []
    acc[mod.modifier_group_id].push(mod)
    return acc
  }, {} as Record<string, Modifier[]>)

  const modifierGroupsByMenuItem = menuItemModifierGroups.reduce((acc: Record<string, (ModifierGroup & { is_required: boolean; modifiers: Modifier[] })[]>, mig: { menu_item_id: string; modifier_group_id: string; is_required: boolean }) => {
    if (!acc[mig.menu_item_id]) acc[mig.menu_item_id] = []
    const group = modifierGroups.find((g: ModifierGroup) => g.id === mig.modifier_group_id)
    if (group) {
      acc[mig.menu_item_id].push({
        ...group,
        is_required: mig.is_required,
        modifiers: modifiersByGroup[mig.modifier_group_id] || [],
      })
    }
    return acc
  }, {} as Record<string, (ModifierGroup & { is_required: boolean; modifiers: Modifier[] })[]>)

  return menuItems.map((item: MenuItem) => ({
    ...item,
    modifier_groups: modifierGroupsByMenuItem[item.id] || [],
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
