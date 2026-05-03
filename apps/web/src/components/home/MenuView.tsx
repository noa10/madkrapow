"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { MenuSection } from "@/components/menu/MenuSection";
import type { CategoryWithMenuItems } from "@/lib/queries/menu";
import type { PromoPreview } from "@/components/menu/MenuItemCard";

interface MenuViewProps {
  categories: CategoryWithMenuItems[];
}

export function MenuView({ categories }: MenuViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [promoPreviews, setPromoPreviews] = useState<Map<string, PromoPreview | null>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    let cancelled = false;
    const allItems = categories.flatMap((c) => c.menu_items);
    const uniqueIds = [...new Set(allItems.map((i) => i.id))];
    if (uniqueIds.length === 0) return;

    Promise.all(
      uniqueIds.map(async (itemId) => {
        try {
          const res = await fetch('/api/promos/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, cartSubtotalCents: 0 }),
          });
          const data = await res.json();
          const preview = data.previews?.[0] as PromoPreview | undefined;
          return { itemId, preview: preview ?? null };
        } catch {
          return { itemId, preview: null };
        }
      })
    ).then((responses) => {
      if (cancelled) return;
      const map = new Map<string, PromoPreview | null>();
      for (const { itemId, preview } of responses) {
        map.set(itemId, preview);
      }
      setPromoPreviews(map);
    });

    return () => { cancelled = true; };
  }, [categories]);

  // Scroll to #categories on mount if hash is present
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#categories") {
      const el = document.getElementById("categories");
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    }
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          const sorted = visibleEntries.sort(
            (a, b) => b.boundingClientRect.top - a.boundingClientRect.top
          );
          setActiveId(sorted[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      }
    );

    categories.forEach((category) => {
      const element = document.getElementById(`category-${category.id}`);
      if (element) {
        observerRef.current?.observe(element);
      }
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [categories]);

  const handleClick = (categoryId: string) => {
    const element = document.getElementById(`category-${categoryId}`);
    if (element) {
      const offset = 80;
      const top = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {categories.length > 0 && (
        <div id="categories">
          <nav className="sticky top-16 z-40 backdrop-blur-md bg-background/80 border-b border-white/10 lg:top-0">
            <div className="max-w-7xl mx-auto px-4 w-full">
              <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleClick(category.id)}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                      activeId === `category-${category.id}`
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </div>
      )}

      <div className="py-8 md:py-12">
        {categories.length > 0 ? (
          categories.map((category) => (
            <MenuSection key={category.id} category={category} promoPreviews={promoPreviews} />
          ))
        ) : (
          <div className="max-w-7xl mx-auto px-4 py-12 text-center">
            <p className="text-muted-foreground">No menu items available at the moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
