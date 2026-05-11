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

async function fetchCategories(): Promise<CategoryWithMenuItems[]> {
  const supabase = createPublicClient()

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
    .select('menu_item_id')

  if (migError) throw migError

  const menuItemModifierGroupRefs: MenuItemModifierGroupRef[] = menuItemModifierGroups ?? []
  const allMenuItems: MenuItem[] = menuItems ?? []
  const activeCategories: Category[] = categories ?? []

  const itemsWithModifiers = new Set(menuItemModifierGroupRefs.map((modifierGroup) => modifierGroup.menu_item_id))

  const menuItemsByCategory = allMenuItems.reduce((acc, item) => {
    if (!acc[item.category_id]) acc[item.category_id] = []
    acc[item.category_id].push({ ...item, has_modifiers: itemsWithModifiers.has(item.id) })
    return acc
  }, {} as Record<string, MenuItemWithModifiers[]>)

  return activeCategories.map((category) => ({
    ...category,
    menu_items: menuItemsByCategory[category.id] || [],
  }))
}

export const getCategories = unstable_cache(
  fetchCategories,
  ['categories'],
  { revalidate: 60 }
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

export async function getItemById(id: string): Promise<FullMenuItem | null> {
  const supabase = await getClient()

  const { data: menuItem, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !menuItem) return null

  return hydrateFullMenuItem(supabase, menuItem)
}

export async function getItemBySlug(slug: string): Promise<FullMenuItem | null> {
  const supabase = await getClient()

  const { data: menuItem, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !menuItem) return null

  return hydrateFullMenuItem(supabase, menuItem)
}

async function hydrateFullMenuItem(
  supabase: SupabaseClient<any, any, any>,
  menuItem: MenuItem
): Promise<FullMenuItem | null> {
  const { data: category, error: catError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('id', menuItem.category_id)
    .single()

  if (catError) return null

  const { data: menuItemModifierGroups, error: migError } = await supabase
    .from('menu_item_modifier_groups')
    .select('*')
    .eq('menu_item_id', menuItem.id)

  if (migError) return null

  const modifierGroupIds = [...new Set(menuItemModifierGroups.map((m) => m.modifier_group_id))]

  if (modifierGroupIds.length === 0) {
    return {
      ...menuItem,
      category,
      modifier_groups: [],
    }
  }

  const { data: modifierGroups, error: mgError } = await supabase
    .from('modifier_groups')
    .select('*')
    .in('id', modifierGroupIds)
    .order('sort_order', { ascending: true })

  if (mgError) return null

  const modifierGroupIdList = modifierGroups.map((g) => g.id)

  const { data: modifiers, error: modError } = await supabase
    .from('modifiers')
    .select('*')
    .in('modifier_group_id', modifierGroupIdList)
    .eq('is_available', true)
    .order('sort_order', { ascending: true })

  if (modError) return null

  const modifiersByGroup = modifiers.reduce((acc, mod) => {
    if (!acc[mod.modifier_group_id]) acc[mod.modifier_group_id] = []
    acc[mod.modifier_group_id].push(mod)
    return acc
  }, {} as Record<string, Modifier[]>)

  const modifierGroupsWithModifiers = menuItemModifierGroups.map((mig) => {
    const group = modifierGroups.find((g) => g.id === mig.modifier_group_id)
    if (!group) return null
    return {
      ...group,
      is_required: mig.is_required,
      modifiers: modifiersByGroup[mig.modifier_group_id] || [],
    }
  }).filter(Boolean) as (ModifierGroup & { is_required: boolean; modifiers: Modifier[] })[]

  return {
    ...menuItem,
    category,
    modifier_groups: modifierGroupsWithModifiers,
  }
}
