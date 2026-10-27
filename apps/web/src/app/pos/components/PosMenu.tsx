'use client'

import { useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { PosCategory, PosMenuItem } from '../hooks/usePosData'
import { PosMenuCard } from './PosMenuCard'

interface PosMenuProps {
  categories: PosCategory[]
  itemsByCategory: Map<string, PosMenuItem[]>
  onAdd: (item: PosMenuItem) => void
}

/** The sellable menu: search, category rail and photo cards. */
export function PosMenu({ categories, itemsByCategory, onAdd }: PosMenuProps) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  const normalized = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      categories
        .map((category) => ({
          ...category,
          items: (itemsByCategory.get(category.id) ?? []).filter((item) =>
            normalized
              ? `${item.name} ${item.description ?? ''}`
                  .toLowerCase()
                  .includes(normalized)
              : true
          ),
        }))
        .filter((category) => category.items.length > 0),
    [categories, itemsByCategory, normalized]
  )

  const scrollToCategory = (id: string) => {
    setActiveCategory(id)
    const target = scrollerRef.current?.querySelector<HTMLElement>(`#pos-category-${id}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-white/10 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the menu"
            aria-label="Search the menu"
            className="h-10 bg-white/5 pl-9"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {visible.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => scrollToCategory(category.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                activeCategory === category.id
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No dishes match “{query}”.
          </p>
        ) : (
          visible.map((category) => (
            <section
              key={category.id}
              id={`pos-category-${category.id}`}
              className="scroll-mt-2"
            >
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {category.name}
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-3">
                {category.items.map((item) => (
                  <PosMenuCard key={item.id} item={item} onAdd={onAdd} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
