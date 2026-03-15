import { getCategories, type CategoryWithMenuItems } from '@/lib/queries/menu'
import { MenuItemCard } from '@/components/menu/MenuItemCard'

async function getMenuData(): Promise<CategoryWithMenuItems[]> {
  try {
    return await getCategories()
  } catch (error) {
    console.error('Failed to fetch menu:', error)
    return []
  }
}

function HeroBanner() {
  return (
    <section className="relative h-[300px] md:h-[400px] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-orange-900/80 to-orange-950/90 z-10" />
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{ 
          backgroundImage: 'url(https://images.unsplash.com/photo-1562565652-a0d8f0c59eb4?w=1200&q=80)'
        }}
      />
      <div className="relative z-20 text-center text-white px-4">
        <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">
          Mad Krapow
        </h1>
        <p className="text-xl md:text-2xl text-orange-100">
          Authentic Thai Street Food
        </p>
      </div>
    </section>
  )
}

function CategoryNav({ 
  categories, 
  activeId 
}: { 
  categories: CategoryWithMenuItems[]
  activeId: string | null
}) {
  if (categories.length === 0) return null

  return (
    <nav className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
          {categories.map((category) => (
            <a
              key={category.id}
              href={`#category-${category.id}`}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeId === category.id
                  ? 'bg-orange-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {category.name}
            </a>
          ))}
        </div>
      </div>
    </nav>
  )
}

function MenuSection({ 
  category 
}: { 
  category: CategoryWithMenuItems 
}) {
  if (category.menu_items.length === 0) return null

  return (
    <section 
      id={`category-${category.id}`}
      className="scroll-m-20 py-8 md:py-12"
    >
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-bold mb-2">{category.name}</h2>
        {category.description && (
          <p className="text-muted-foreground mb-6">{category.description}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
          {category.menu_items.map((item) => (
            <MenuItemCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default async function Home() {
  const categories = await getMenuData()

  return (
    <main className="min-h-screen bg-background">
      <HeroBanner />
      <CategoryNav categories={categories} activeId={null} />
      
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
