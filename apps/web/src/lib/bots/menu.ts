import { SupabaseClient } from '@supabase/supabase-js'
import {
  Category,
  MenuItem,
  ModifierGroup,
  Modifier,
} from '@/lib/queries/menu'

export type BotMenuCategory = {
  id: string
  name: string
  items: BotMenuItem[]
}

export type BotMenuItem = {
  id: string
  name: string
  price_cents: number
  description: string | null
  is_available: boolean
  has_modifiers: boolean
}

export type BotItemWithAllModifiers = MenuItem & {
  category: Pick<Category, 'id' | 'name'>
  modifier_groups: (ModifierGroup & {
    is_required: boolean
    modifiers: Modifier[]
  })[]
}

export async function getBotMenu(
  supabase: SupabaseClient<any, any, any>
): Promise<BotMenuCategory[]> {
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (catError) throw catError

  const { data: menuItems, error: itemError } = await supabase
    .from('menu_items')
    .select('*')
    .eq('is_available', true)
    .order('sort_order', { ascending: true })

  if (itemError) throw itemError

  const { data: menuItemModifierGroups, error: migError } = await supabase
    .from('menu_item_modifier_groups')
    .select('menu_item_id')

  if (migError) throw migError

  const itemsWithModifiers = new Set(
    (menuItemModifierGroups ?? []).map((m) => m.menu_item_id)
  )

  const itemsByCategory = (menuItems ?? []).reduce<Record<string, BotMenuItem[]>>(
    (acc, item) => {
      if (!acc[item.category_id]) acc[item.category_id] = []
      acc[item.category_id].push({
        id: item.id,
        name: item.name,
        price_cents: item.price_cents,
        description: item.description,
        is_available: item.is_available,
        has_modifiers: itemsWithModifiers.has(item.id),
      })
      return acc
    },
    {}
  )

  return (categories ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    items: itemsByCategory[category.id] || [],
  }))
}

/**
 * Fetch a single item with ALL modifier groups and modifiers.
 * Unlike the web hydrator, this does NOT filter out unavailable modifiers
 * so the bot can decide how to present them.
 */
export async function getBotItemWithModifiers(
  supabase: SupabaseClient<any, any, any>,
  itemId: string
): Promise<BotItemWithAllModifiers | null> {
  const { data: menuItem, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('id', itemId)
    .single()

  if (error || !menuItem) return null

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
    .order('sort_order', { ascending: true })

  if (modError) return null

  const modifiersByGroup = modifiers.reduce<Record<string, Modifier[]>>(
    (acc, mod) => {
      if (!acc[mod.modifier_group_id]) acc[mod.modifier_group_id] = []
      acc[mod.modifier_group_id].push(mod)
      return acc
    },
    {}
  )

  const modifierGroupsWithModifiers = menuItemModifierGroups
    .map((mig) => {
      const group = modifierGroups.find((g) => g.id === mig.modifier_group_id)
      if (!group) return null
      return {
        ...group,
        is_required: mig.is_required,
        modifiers: modifiersByGroup[mig.modifier_group_id] || [],
      }
    })
    .filter(Boolean) as (ModifierGroup & {
    is_required: boolean
    modifiers: Modifier[]
  })[]

  return {
    ...menuItem,
    category,
    modifier_groups: modifierGroupsWithModifiers,
  }
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/**
 * Generate a plain-text menu suitable for sending in a chat message.
 */
export function formatBotMenuText(menu: BotMenuCategory[]): string {
  if (menu.length === 0) {
    return 'Our menu is currently empty. Please check back later!'
  }

  const lines: string[] = ['*Menu*']

  for (const category of menu) {
    if (category.items.length === 0) continue

    lines.push('')
    lines.push(`*${category.name}*`)

    for (const item of category.items) {
      const price = formatPrice(item.price_cents)
      const modifierHint = item.has_modifiers ? ' [+opts]' : ''
      lines.push(`  ${item.name} — ${price}${modifierHint}`)
      if (item.description) {
        lines.push(`    _${item.description}_`)
      }
    }
  }

  return lines.join('\n').trim()
}

/**
 * Generate a detailed item description with modifiers for bot display.
 */
export function formatBotItemDetails(item: BotItemWithAllModifiers): string {
  const lines: string[] = []

  lines.push(`*${item.name}*`)
  lines.push(`${formatPrice(item.price_cents)}`)

  if (item.description) {
    lines.push(item.description)
  }

  if (!item.is_available) {
    lines.push('*Currently unavailable*')
  }

  if (item.modifier_groups.length > 0) {
    lines.push('')
    lines.push('*Options:*')

    for (const group of item.modifier_groups) {
      const requiredTag = group.is_required ? ' (Required)' : ''
      const selectionRange =
        group.min_selections === group.max_selections
          ? `Pick ${group.min_selections}`
          : `Pick ${group.min_selections}-${group.max_selections}`

      lines.push('')
      lines.push(`*${group.name}*${requiredTag} — ${selectionRange}`)

      for (const mod of group.modifiers) {
        const priceTag = mod.price_delta_cents > 0 ? ` (+${formatPrice(mod.price_delta_cents)})` : ''
        const defaultTag = mod.is_default ? ' [default]' : ''
        const unavailableTag = !mod.is_available ? ' [unavailable]' : ''
        lines.push(`  ${mod.name}${priceTag}${defaultTag}${unavailableTag}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Check whether a menu item and all of its modifiers are currently available.
 * Returns an object with overall availability and per-group breakdown.
 */
export async function isItemAvailable(
  supabase: SupabaseClient<any, any, any>,
  itemId: string
): Promise<{
  available: boolean
  itemAvailable: boolean
  allModifiersAvailable: boolean
  unavailableModifierIds: string[]
}> {
  const { data: menuItem, error } = await supabase
    .from('menu_items')
    .select('is_available')
    .eq('id', itemId)
    .single()

  if (error || !menuItem) {
    return {
      available: false,
      itemAvailable: false,
      allModifiersAvailable: false,
      unavailableModifierIds: [],
    }
  }

  const itemAvailable = menuItem.is_available

  const { data: menuItemModifierGroups, error: migError } = await supabase
    .from('menu_item_modifier_groups')
    .select('modifier_group_id')
    .eq('menu_item_id', itemId)

  if (migError || !menuItemModifierGroups || menuItemModifierGroups.length === 0) {
    return {
      available: itemAvailable,
      itemAvailable,
      allModifiersAvailable: true,
      unavailableModifierIds: [],
    }
  }

  const modifierGroupIds = menuItemModifierGroups.map((m) => m.modifier_group_id)

  const { data: modifiers, error: modError } = await supabase
    .from('modifiers')
    .select('id, is_available')
    .in('modifier_group_id', modifierGroupIds)

  if (modError || !modifiers) {
    return {
      available: itemAvailable,
      itemAvailable,
      allModifiersAvailable: true,
      unavailableModifierIds: [],
    }
  }

  const unavailableModifierIds = modifiers
    .filter((m) => !m.is_available)
    .map((m) => m.id)

  const allModifiersAvailable = unavailableModifierIds.length === 0

  return {
    available: itemAvailable && allModifiersAvailable,
    itemAvailable,
    allModifiersAvailable,
    unavailableModifierIds,
  }
}
