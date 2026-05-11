import { getCategories, type CategoryWithMenuItems } from '@/lib/queries/menu'
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

export default async function MenuPage() {
  const categories = await getMenuData()

  return (
    <ClientPageShell activeHref="/menu">
      {RICH_MENU_ENABLED
        ? <MenuCatalogView categories={categories} />
        : <MenuListView categories={categories} />}
    </ClientPageShell>
  )
}
