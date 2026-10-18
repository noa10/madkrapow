"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MenuSection } from "@/components/menu/MenuSection";
import type { CategoryWithMenuItems } from "@/lib/queries/menu";
import type { PromoPreview } from "@/components/menu/MenuItemCard";

interface MenuListViewProps {
  categories: CategoryWithMenuItems[];
  quickAddEnabled?: boolean;
}

// Session-level cache: navigating away and back should not re-fetch the same
// promo previews. Failures are never cached so a later mount can retry.
const promoPreviewCache = new Map<string, PromoPreview | null>();

function readCachedPromoPreviews(
  itemIds: string[]
): Map<string, PromoPreview | null> | null {
  const cached = new Map<string, PromoPreview | null>();
  for (const itemId of itemIds) {
    if (!promoPreviewCache.has(itemId)) return null;
    cached.set(itemId, promoPreviewCache.get(itemId) ?? null);
  }
  return cached;
}

function getMenuItemIds(categories: CategoryWithMenuItems[]): string[] {
  return [...new Set(categories.flatMap((c) => c.menu_items.map((item) => item.id)))];
}

function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function MenuListView({ categories, quickAddEnabled = false }: MenuListViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [promoPreviews, setPromoPreviews] = useState<Map<string, PromoPreview | null>>(
    () => readCachedPromoPreviews(getMenuItemIds(categories)) ?? new Map()
  );
  const observerRef = useRef<IntersectionObserver | null>(null);
  const didInitialScrollRef = useRef(false);

  const categorySlugMap = new Map<string, CategoryWithMenuItems>();
  categories.forEach((c) => categorySlugMap.set(slugifyCategoryName(c.name), c));

  useEffect(() => {
    let cancelled = false;
    const uniqueIds = getMenuItemIds(categories);
    if (uniqueIds.length === 0) return;
    if (uniqueIds.every((itemId) => promoPreviews.has(itemId))) return;

    (async () => {
      let previews: Map<string, PromoPreview | null> | null = null;

      try {
        const res = await fetch('/api/promos/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemIds: uniqueIds, cartSubtotalCents: 0 }),
        });
        if (!res.ok) throw new Error(`Promo preview request failed: ${res.status}`);

        const data = (await res.json()) as {
          previewsByItem?: Record<string, PromoPreview[] | undefined>;
        };

        previews = new Map<string, PromoPreview | null>();
        for (const itemId of uniqueIds) {
          const preview = data.previewsByItem?.[itemId]?.[0] ?? null;
          previews.set(itemId, preview);
          promoPreviewCache.set(itemId, preview);
        }
      } catch {
        previews = null;
      }

      if (cancelled) return;

      if (previews) {
        setPromoPreviews(previews);
      } else {
        // Batch failed: keep each item's fallback (no promo badge) rather than
        // leaving the whole map unset.
        const fallback = new Map<string, PromoPreview | null>();
        for (const itemId of uniqueIds) fallback.set(itemId, null);
        setPromoPreviews(fallback);
      }
    })();

    return () => { cancelled = true; };
  }, [categories, promoPreviews]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (didInitialScrollRef.current) return;

    const categorySlug = searchParams.get("category");
    if (!categorySlug) return;

    const category = categorySlugMap.get(categorySlug);
    if (!category) return;

    const element = document.getElementById(`category-${category.id}`);
    if (!element) return;

    didInitialScrollRef.current = true;
    setTimeout(() => {
      const offset = 80;
      const top = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, categories]);

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

  const handleClick = (category: CategoryWithMenuItems) => {
    const element = document.getElementById(`category-${category.id}`);
    if (element) {
      const offset = 80;
      const top = element.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
    const slug = slugifyCategoryName(category.name);
    const params = new URLSearchParams(searchParams.toString());
    params.set("category", slug);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="min-h-screen bg-background">
      {categories.length > 0 && (
        <div>
          <nav className="sticky top-16 z-40 backdrop-blur-md bg-background/80 border-b border-white/10 lg:top-0">
            <div className="max-w-7xl mx-auto px-4 w-full">
              <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleClick(category)}
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
            <MenuSection
              key={category.id}
              category={category}
              promoPreviews={promoPreviews}
              quickAddEnabled={quickAddEnabled}
            />
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
