import { MenuItemCard } from './MenuItemCard'
import type { CategoryWithMenuItems } from '@/lib/queries/menu'
import type { PromoPreview } from './MenuItemCard'

interface MenuSectionProps {
  category: CategoryWithMenuItems
  promoPreviews?: Map<string, PromoPreview | null>
}

export function MenuSection({ category, promoPreviews }: MenuSectionProps) {
  if (category.menu_items.length === 0) return null

  return (
    <section
      id={`category-${category.id}`}
      className="scroll-m-20 py-8 md:py-12"
    >
      <div className="max-w-7xl mx-auto px-4 w-full">
        <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2">{category.name}</h2>
        {category.description && (
          <p className="text-muted-foreground mb-6">{category.description}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 w-full">
          {category.menu_items.map((item) => (
            <MenuItemCard key={item.id} item={item} promoPreview={promoPreviews?.get(item.id) ?? null} />
          ))}
        </div>
      </div>
    </section>
  )
}