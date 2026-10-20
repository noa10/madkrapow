"use client";

import { memo } from "react";
import type { CategoryWithMenuItems, MenuItemWithModifiers } from "@/lib/queries/menu";
import { RichMenuCard } from "./RichMenuCard";

interface RichMenuGridProps {
  categories: CategoryWithMenuItems[];
  onSelectItem: (item: MenuItemWithModifiers) => void;
}

export const RichMenuGrid = memo(function RichMenuGrid({ categories, onSelectItem }: RichMenuGridProps) {
  return (
    <>
      {categories.map((category) => {
        if (category.menu_items.length === 0) return null;
        return (
          <section
            key={category.id}
            id={`category-${category.id}`}
            className="scroll-mt-[calc(var(--topbar-h)_+_64px)] py-10 lg:scroll-mt-[calc(var(--topbar-h)_+_24px)] lg:py-12"
          >
            <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[clamp(1.375rem,1.15rem+0.9vw,1.875rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-foreground">
                  {category.name}
                </h2>
                {category.description && (
                  <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                    {category.description}
                  </p>
                )}
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {category.menu_items.length} {category.menu_items.length === 1 ? "item" : "items"}
              </p>
            </div>
            <div className="grid gap-3 sm:gap-3.5 md:grid-cols-2">
              {category.menu_items.map((item) => (
                <RichMenuCard key={item.id} item={item} onSelect={onSelectItem} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
});
