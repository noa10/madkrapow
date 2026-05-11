"use client";

import type { CategoryWithMenuItems } from "@/lib/queries/menu";
import { RichMenuCard } from "./RichMenuCard";

interface RichMenuGridProps {
  categories: CategoryWithMenuItems[];
}

export function RichMenuGrid({ categories }: RichMenuGridProps) {
  return (
    <>
      {categories.map((category) => {
        if (category.menu_items.length === 0) return null;
        return (
          <section
            key={category.id}
            id={`category-${category.id}`}
            className="scroll-m-24 px-4 py-10 sm:px-6 lg:px-8 lg:py-14"
          >
            <div className="mx-auto max-w-7xl">
              <h2 className="font-display text-2xl text-white sm:text-3xl">
                {category.name}
              </h2>
              {category.description && (
                <p className="mt-2 text-sm leading-6 text-[#d8d1c6] sm:text-base">
                  {category.description}
                </p>
              )}
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {category.menu_items.map((item) => (
                  <RichMenuCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
