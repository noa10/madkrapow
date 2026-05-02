import { getCategories, type CategoryWithMenuItems } from '@/lib/queries/menu'
import { MenuView } from '@/components/home/MenuView'
import { ClientPageShell } from '@/components/layout/ClientPageShell'

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
      <MenuView categories={categories} />
    </ClientPageShell>
  )
}
