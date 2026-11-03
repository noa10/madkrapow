import { getServerClient } from '../supabase/server'
import { createClient } from '../supabase/client'
import { SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

export async function getClient(supabase?: SupabaseClient<any, any, any>): Promise<SupabaseClient<any, any, any>> {
  if (supabase) return supabase
  if (typeof window === 'undefined') {
    return getServerClient()
  }
  return createClient()
}

function createPublicClient() {
  return createClient()
}
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
  spice_level: number
  ingredients: string[]
  is_signature: boolean
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

export type MenuItemModifierGroup = {
  id: string
  menu_item_id: string
  modifier_group_id: string
  is_required: boolean
  created_at: string
}

type MenuItemModifierGroupRef = Pick<MenuItemModifierGroup, 'menu_item_id'>

export type MenuItemWithModifiers = MenuItem & {
  has_modifiers: boolean
}

export type CategoryWithMenuItems = Category & {
  menu_items: MenuItemWithModifiers[]
}

export type MenuItemWithModifierGroups = MenuItem & {
  modifier_groups: (ModifierGroup & { is_required: boolean })[]
}

export type ModifierGroupWithModifiers = ModifierGroup & {
  modifiers: Modifier[]
}

export type FullMenuItem = MenuItem & {
  category: Pick<Category, 'id' | 'name'>
  modifier_groups: (ModifierGroup & { is_required: boolean; modifiers: Modifier[] })[]
}

/**
 * One round trip instead of three: categories embed their items, and each item
 * embeds the join rows we only need the existence of (`has_modifiers`).
 * PostgREST cannot order an aliased embed, so ordering happens here — the menu
 * is a few dozen rows.
 */
type CategoryRowWithItems = Category & {
  menu_items:
    | (MenuItem & { menu_item_modifier_groups: MenuItemModifierGroupRef[] | null })[]
    | null
}

async function fetchCategories(): Promise<CategoryWithMenuItems[]> {
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('categories')
    .select('*, menu_items(*, menu_item_modifier_groups(menu_item_id))')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as CategoryRowWithItems[]

  return rows.map(({ menu_items, ...category }) => ({
    ...category,
    menu_items: [...(menu_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ menu_item_modifier_groups, ...item }) => ({
        ...item,
        has_modifiers: (menu_item_modifier_groups ?? []).length > 0,
      })),
  }))
}

/**
 * Cache tag shared by every menu read. Admin item writes call
 * `revalidateTag(MENU_CACHE_TAG)` so edits show immediately instead of after
 * the revalidate window.
 */
export const MENU_CACHE_TAG = 'menu'

export const getCategories = unstable_cache(
  fetchCategories,
  ['categories'],
  { revalidate: 60, tags: [MENU_CACHE_TAG] }
)

export type ModifierGroupsByMenuItem = Record<string, FullMenuItem['modifier_groups']>

async function fetchModifierGroupsByMenuItem(): Promise<ModifierGroupsByMenuItem> {
  const supabase = createPublicClient()

  const { data: menuItemModifierGroups, error: migError } = await supabase
    .from('menu_item_modifier_groups')
    .select('*')

  if (migError) throw migError

  const menuItemModifierGroupRows: MenuItemModifierGroup[] = menuItemModifierGroups ?? []

  const modifierGroupIds = [
    ...new Set(menuItemModifierGroupRows.map((m) => m.modifier_group_id)),
  ]

  if (modifierGroupIds.length === 0) return {}

  const { data: modifierGroups, error: mgError } = await supabase
    .from('modifier_groups')
    .select('*')
    .in('id', modifierGroupIds)
    .order('sort_order', { ascending: true })

  if (mgError) throw mgError

  const { data: modifiers, error: modError } = await supabase
    .from('modifiers')
    .select('*')
    .in('modifier_group_id', modifierGroupIds)
    .eq('is_available', true)
    .order('sort_order', { ascending: true })

  if (modError) throw modError

  const modifierGroupRows: ModifierGroup[] = modifierGroups ?? []
  const modifierRows: Modifier[] = modifiers ?? []

  const modifiersByGroup = modifierRows.reduce((acc, mod) => {
    if (!acc[mod.modifier_group_id]) acc[mod.modifier_group_id] = []
    acc[mod.modifier_group_id].push(mod)
    return acc
  }, {} as Record<string, Modifier[]>)

  return menuItemModifierGroupRows.reduce((acc, mig) => {
    if (!acc[mig.menu_item_id]) acc[mig.menu_item_id] = []
    const group = modifierGroupRows.find((g) => g.id === mig.modifier_group_id)
    if (group) {
      acc[mig.menu_item_id].push({
        ...group,
        is_required: mig.is_required,
        modifiers: modifiersByGroup[mig.modifier_group_id] || [],
      })
    }
    return acc
  }, {} as ModifierGroupsByMenuItem)
}

/**
 * Modifier groups (with their available modifiers) keyed by menu item id —
 * lets the menu quick-view dialog render customization options without a
 * per-item round trip when a card is opened.
 */
export const getModifierGroupsByItem = unstable_cache(
  fetchModifierGroupsByMenuItem,
  ['modifier-groups-by-item'],
  { revalidate: 60, tags: [MENU_CACHE_TAG] }
)

export async function getMenuItems(): Promise<MenuItemWithModifierGroups[]> {
  const supabase = await getClient()

  const { data: menuItems, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) throw error

  const { data: menuItemModifierGroups, error: migError } = await supabase
    .from('menu_item_modifier_groups')
    .select('*')

  if (migError) throw migError

  const modifierGroupIds = [...new Set(menuItemModifierGroups.map((m) => m.modifier_group_id))]

  const { data: modifierGroups, error: mgError } = await supabase
    .from('modifier_groups')
    .select('*')
    .in('id', modifierGroupIds)
    .order('sort_order', { ascending: true })

  if (mgError) throw mgError

  const modifierGroupIdList = modifierGroups.map((g) => g.id)

  const { data: modifiers, error: modError } = await supabase
    .from('modifiers')
    .select('*')
    .in('modifier_group_id', modifierGroupIdList)
    .eq('is_available', true)
    .order('sort_order', { ascending: true })

  if (modError) throw modError

  const modifiersByGroup = modifiers.reduce((acc, mod) => {
    if (!acc[mod.modifier_group_id]) acc[mod.modifier_group_id] = []
    acc[mod.modifier_group_id].push(mod)
    return acc
  }, {} as Record<string, Modifier[]>)

  const modifierGroupsByMenuItem = menuItemModifierGroups.reduce((acc, mig) => {
    if (!acc[mig.menu_item_id]) acc[mig.menu_item_id] = []
    const group = modifierGroups.find((g) => g.id === mig.modifier_group_id)
    if (group) {
      acc[mig.menu_item_id].push({
        ...group,
        is_required: mig.is_required,
        modifiers: modifiersByGroup[mig.modifier_group_id] || [],
      })
    }
    return acc
  }, {} as Record<string, (ModifierGroup & { is_required: boolean; modifiers: Modifier[] })[]>)

  return menuItems.map((item) => ({
    ...item,
    modifier_groups: modifierGroupsByMenuItem[item.id] || [],
  }))
}

export async function getFullMenuTree(): Promise<(Category & { menu_items: FullMenuItem[] })[]> {
  const supabase = await getClient()

  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw error

  const { data: menuItems, error: menuItemsError } = await supabase
    .from('menu_items')
    .select('*')
    .order('sort_order', { ascending: true })

  if (menuItemsError) throw menuItemsError

  const { data: menuItemModifierGroups, error: migError } = await supabase
    .from('menu_item_modifier_groups')
    .select('*')

  if (migError) throw migError

  const modifierGroupIds = [...new Set(menuItemModifierGroups.map((m) => m.modifier_group_id))]

  const { data: modifierGroups, error: mgError } = await supabase
    .from('modifier_groups')
    .select('*')
    .in('id', modifierGroupIds)
    .order('sort_order', { ascending: true })

  if (mgError) throw mgError

  const modifierGroupIdList = modifierGroups.map((g) => g.id)

  const { data: modifiers, error: modError } = await supabase
    .from('modifiers')
    .select('*')
    .in('modifier_group_id', modifierGroupIdList)
    .eq('is_available', true)
    .order('sort_order', { ascending: true })

  if (modError) throw modError

  const modifiersByGroup = modifiers.reduce((acc, mod) => {
    if (!acc[mod.modifier_group_id]) acc[mod.modifier_group_id] = []
    acc[mod.modifier_group_id].push(mod)
    return acc
  }, {} as Record<string, Modifier[]>)

  const modifierGroupsByMenuItem = menuItemModifierGroups.reduce((acc, mig) => {
    if (!acc[mig.menu_item_id]) acc[mig.menu_item_id] = []
    const group = modifierGroups.find((g) => g.id === mig.modifier_group_id)
    if (group) {
      acc[mig.menu_item_id].push({
        ...group,
        is_required: mig.is_required,
        modifiers: modifiersByGroup[mig.modifier_group_id] || [],
      })
    }
    return acc
  }, {} as Record<string, (ModifierGroup & { is_required: boolean; modifiers: Modifier[] })[]>)

  const menuItemsByCategory = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    if (!acc[item.category_id]) acc[item.category_id] = []
    acc[item.category_id].push(item)
    return acc
  }, {} as Record<string, MenuItem[]>)

  const categoriesWithMenuItems: (Category & { menu_items: FullMenuItem[] })[] = categories.map((category) => ({
    ...category,
    menu_items: (menuItemsByCategory[category.id] || []).map((item) => ({
      ...item,
      category: { id: category.id, name: category.name },
      modifier_groups: modifierGroupsByMenuItem[item.id] || [],
    })),
  }))

  return categoriesWithMenuItems
}

/**
 * Everything the item page needs in one round trip: the item, its category,
 * and the join rows down to the modifiers. Fetching the same data as five
 * sequential queries cost ~1.9s against the Tokyo project; this costs ~0.2s.
 */
const ITEM_DETAIL_SELECT =
  '*,category:categories(id,name),links:menu_item_modifier_groups(is_required,group:modifier_groups(*,modifiers(*)))'

type ItemDetailRow = MenuItem & {
  category: Pick<Category, 'id' | 'name'> | null
  links:
    | {
        is_required: boolean
        group: (ModifierGroup & { modifiers: Modifier[] | null }) | null
      }[]
    | null
}

type HydratedModifierGroup = FullMenuItem['modifier_groups'][number]

/**
 * Flattens the embedded join rows into the shape the UI expects. Ordering and
 * the `is_available` filter run here rather than in the query: PostgREST
 * cannot order an aliased embed, and the modifier table is tiny.
 */
function toFullMenuItem(row: ItemDetailRow): FullMenuItem | null {
  if (!row.category) return null

  const { links, ...menuItem } = row

  const modifierGroups = (links ?? [])
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
    .sort((a, b) => a.sort_order - b.sort_order)

  return { ...menuItem, category: row.category, modifier_groups: modifierGroups }
}

async function fetchItemById(id: string): Promise<FullMenuItem | null> {
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select(ITEM_DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return null

  return toFullMenuItem(data as ItemDetailRow)
}

async function fetchItemBySlug(slug: string): Promise<FullMenuItem | null> {
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('menu_items')
    .select(ITEM_DETAIL_SELECT)
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) return null

  return toFullMenuItem(data as ItemDetailRow)
}

/**
 * Cached per id/slug. The page still renders on demand (a dynamic segment is
 * not prerendered without `generateStaticParams`), but the render no longer
 * waits on Supabase — the worst case drops from ~2.5s to a cache hit.
 */
export const getItemById = unstable_cache(fetchItemById, ['item-by-id'], {
  revalidate: 60,
  tags: [MENU_CACHE_TAG],
})

export const getItemBySlug = unstable_cache(fetchItemBySlug, ['item-by-slug'], {
  revalidate: 60,
  tags: [MENU_CACHE_TAG],
})

/** Slugs for `generateStaticParams` — lets the build prerender the catalog. */
export const getItemSlugs = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = createPublicClient()

    const { data, error } = await supabase
      .from('menu_items')
      .select('slug')
      .order('sort_order', { ascending: true })

    if (error) throw error

    const rows = (data ?? []) as { slug: string | null }[]

    return rows
      .map((row) => row.slug)
      .filter((slug): slug is string => Boolean(slug))
  },
  ['item-slugs'],
  { revalidate: 60, tags: [MENU_CACHE_TAG] }
)
