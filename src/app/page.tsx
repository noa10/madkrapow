import { getCategories, type CategoryWithMenuItems } from '@/lib/queries/menu'
import { MenuNav } from '@/components/menu/MenuNav'
import { MenuSection } from '@/components/menu/MenuSection'
import { Hero } from '@/components/home/Hero'

async function getMenuData(): Promise<CategoryWithMenuItems[]> {
  try {
    return await getCategories()
  } catch (error) {
    console.error('Failed to fetch menu:', error)
    return []
  }
}

function HeroBanner() {
  return <Hero />
}

export default async function Home() {
  const categories = await getMenuData()

  return (
    <main className="min-h-screen bg-background">
      <HeroBanner />
      <MenuNav categories={categories} />
      
      <div className="py-8 md:py-12">
        {categories.length > 0 ? (
          categories.map((category) => (
            <MenuSection key={category.id} category={category} />
          ))
        ) : (
          <div className="max-w-7xl mx-auto px-4 py-12 text-center">
            <p className="text-muted-foreground">No menu items available at the moment.</p>
          </div>
        )}
      </div>
    </main>
  )
}