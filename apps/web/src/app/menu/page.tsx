import {
  getCategories,
  getModifierGroupsByItem,
  type CategoryWithMenuItems,
  type ModifierGroupsByMenuItem,
} from '@/lib/queries/menu'
import { ClientPageShell } from '@/components/layout/ClientPageShell'
import { MenuCatalogView } from '@/components/menu/MenuCatalogView'
import { MenuListView } from '@/components/menu/MenuListView'

const RICH_MENU_ENABLED = process.env.NEXT_PUBLIC_RICH_MENU_V2 !== '0'

async function getMenuData(): Promise<CategoryWithMenuItems[]> {
  try {
    return await getCategories()
  } catch (error) {
    console.error('Failed to fetch menu:', error)
    return []
  }
}

async function getModifiersData(): Promise<ModifierGroupsByMenuItem | null> {
  if (!RICH_MENU_ENABLED) return {}
  try {
    return await getModifierGroupsByItem()
  } catch (error) {
    console.error('Failed to fetch menu modifiers:', error)
    // `null` (not `{}`): the catalog must not treat failed modifier data as
    // "item has no options", which would bypass required-option validation.
    // Items that need modifiers fall back to their item page instead.
    return null
  }
}

export default async function MenuPage() {
  const [categories, modifierGroupsByItem] = await Promise.all([
    getMenuData(),
    getModifiersData(),
  ])

  return (
    <ClientPageShell activeHref="/menu">
      {RICH_MENU_ENABLED
        ? <MenuCatalogView categories={categories} modifierGroupsByItem={modifierGroupsByItem} />
        : <MenuListView categories={categories} />}
    </ClientPageShell>
  )
}
