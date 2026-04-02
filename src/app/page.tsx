import { getCategories, type CategoryWithMenuItems } from '@/lib/queries/menu'
import { PageSwitcher } from '@/components/home/PageSwitcher'

async function getMenuData(): Promise<CategoryWithMenuItems[]> {
  try {
    return await getCategories()
  } catch (error) {
    console.error('Failed to fetch menu:', error)
    return []
  }
}

export default async function Home() {
  const categories = await getMenuData()

  return <PageSwitcher categories={categories} />
}