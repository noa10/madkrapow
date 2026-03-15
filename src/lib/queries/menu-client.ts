import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

export async function getMenuItems(): Promise<MenuItemWithModifierGroups[]> {
  const { data: menuItems, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('is_available', true)
    .order('sort_order', { ascending: true })

  if (error) throw error

  const { data: menuItemModifierGroups, error: migError } = await supabase
    .from('menu_item_modifier_groups')
    .select('*')

  if (migError) throw migError

  const modifierGroupIds = [...new Set(menuItemModifierGroups.map((m) => m.modifier_group_id))]

  if (modifierGroupIds.length === 0) {
    return menuItems.map((item) => ({ ...item, modifier_groups: [] }))
  }

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
