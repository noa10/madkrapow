'use client'

import { memo } from 'react'
import { MenuItemCard } from './MenuItemCard'
import type { CategoryWithMenuItems } from '@/lib/queries/menu'
import type { PromoPreview } from './MenuItemCard'

interface MenuSectionProps {
  category: CategoryWithMenuItems
  promoPreviews?: Map<string, PromoPreview | null>
  quickAddEnabled?: boolean
}

export const MenuSection = memo(function MenuSection({ category, promoPreviews, quickAddEnabled = false }: MenuSectionProps) {
  if (category.menu_items.length === 0) return null

  return (
    <section
      id={`category-${category.id}`}
      className="scroll-mt-[136px] px-4 py-8 sm:px-6 md:py-10 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-[clamp(1.375rem,1.15rem+0.9vw,1.875rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-foreground">
              {category.name}
            </h2>
            {category.description && (
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{category.description}</p>
            )}
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {category.menu_items.length} {category.menu_items.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          {category.menu_items.map((item) => (
            <MenuItemCard key={item.id} item={item} promoPreview={promoPreviews?.get(item.id) ?? null} quickAddEnabled={quickAddEnabled} />
          ))}
        </div>
      </div>
    </section>
  )
})
