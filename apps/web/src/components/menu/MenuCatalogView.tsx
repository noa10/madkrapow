"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type {
  CategoryWithMenuItems,
  MenuItemWithModifiers,
  ModifierGroupsByMenuItem,
} from "@/lib/queries/menu";
import { SignatureHero } from "./SignatureHero";
import { RichMenuGrid } from "./RichMenuGrid";
import { MenuSearchInput } from "./MenuSearchInput";
import { ItemQuickView } from "./ItemQuickView";
import { cn } from "@/lib/utils";

interface MenuCatalogViewProps {
  categories: CategoryWithMenuItems[];
  modifierGroupsByItem: ModifierGroupsByMenuItem;
}

function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function MenuCatalogView({ categories, modifierGroupsByItem }: MenuCatalogViewProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quickViewItem, setQuickViewItem] = useState<MenuItemWithModifiers | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const catbarRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const initialCategoryRef = useRef<string | null>(searchParams.get("category"));

  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  // Browse mode: the signature items live in the hero, not in the sections.
  const { signatureItems, browseCategories } = useMemo(() => {
    const allItems = categories.flatMap((c) => c.menu_items);
    const featured = allItems.filter((item) => item.is_signature).slice(0, 2);
    const signatureIds = new Set(featured.map((item) => item.id));
    return {
      signatureItems: featured,
      browseCategories: categories.map((category) => ({
        ...category,
        menu_items: category.menu_items.filter((item) => !signatureIds.has(item.id)),
      })),
    };
  }, [categories]);

  // Search mode: match every item (signature ones included) by name and
  // description, dropping categories that end up with no matches.
  const searchCategories = useMemo(() => {
    if (!isSearching) return [];
    return categories
      .map((category) => ({
        ...category,
        menu_items: category.menu_items.filter((item) =>
          `${item.name} ${item.description ?? ""}`.toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((category) => category.menu_items.length > 0);
  }, [categories, isSearching, normalizedQuery]);

  const visibleCategories = isSearching ? searchCategories : browseCategories;
  const navCategories = useMemo(
    () => visibleCategories.filter((category) => category.menu_items.length > 0),
    [visibleCategories]
  );

  const handleSelectItem = useCallback((item: MenuItemWithModifiers) => {
    setQuickViewItem(item);
  }, []);

  const closeQuickView = useCallback(() => {
    setQuickViewItem(null);
  }, []);

  // Compose the full item shape the quick-view dialog expects: category name
  // (cards don't carry it) + modifier groups (prefetched server-side).
  const quickViewItemFull = useMemo(() => {
    if (!quickViewItem) return null;
    return {
      ...quickViewItem,
      category: {
        id: quickViewItem.category_id,
        name: categories.find((category) => category.id === quickViewItem.category_id)?.name ?? "",
      },
      modifier_groups: modifierGroupsByItem[quickViewItem.id] ?? [],
    };
  }, [quickViewItem, categories, modifierGroupsByItem]);

  // Scroll-spy: highlight the section parked under the topbar (+ the mobile
  // category bar when it is showing). Re-observes when the visible set
  // changes (search) and when the layout switch flips at the lg breakpoint.
  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 1024px)");

    const observeSections = () => {
      observerRef.current?.disconnect();
      const topOffset = breakpoint.matches ? 96 : 136;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          let topmost: IntersectionObserverEntry | null = null;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            if (
              !topmost ||
              entry.boundingClientRect.top > topmost.boundingClientRect.top
            ) {
              topmost = entry;
            }
          }
          if (topmost) {
            const nextId = topmost.target.id;
            setActiveId((prev) => (prev === nextId ? prev : nextId));
          }
        },
        { rootMargin: `${-topOffset}px 0px -60% 0px`, threshold: 0 }
      );
      for (const category of navCategories) {
        const el = document.getElementById(`category-${category.id}`);
        if (el) observerRef.current?.observe(el);
      }
    };

    observeSections();
    breakpoint.addEventListener("change", observeSections);
    return () => {
      breakpoint.removeEventListener("change", observeSections);
      observerRef.current?.disconnect();
    };
  }, [navCategories]);

  // Deep link: land on the ?category= section on first load
  useEffect(() => {
    const slug = initialCategoryRef.current;
    if (!slug) return;
    const match = categories.find((c) => slugifyCategoryName(c.name) === slug);
    if (!match) return;
    const el = document.getElementById(`category-${match.id}`);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  }, [categories]);

  // Keep the active pill visible in the mobile category bar as sections scroll by
  useEffect(() => {
    if (!activeId) return;
    const container = catbarRef.current;
    if (!container || container.scrollWidth <= container.clientWidth) return;
    const el = container.querySelector<HTMLElement>(`[data-cat="${activeId}"]`);
    if (!el) return;
    const elRect = el.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const target =
      container.scrollLeft + (elRect.left - contRect.left) - (contRect.width - elRect.width) / 2;
    container.scrollTo({ left: target, behavior: "smooth" });
  }, [activeId]);

  // Keep the active row visible in the desktop sidebar
  useEffect(() => {
    if (!activeId) return;
    const container = sidebarRef.current;
    if (!container || container.scrollHeight <= container.clientHeight) return;
    const el = container.querySelector<HTMLElement>(`[data-cat="${activeId}"]`);
    if (!el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < container.scrollTop || bottom > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: top - container.clientHeight / 2, behavior: "smooth" });
    }
  }, [activeId]);

  const handleClick = (category: CategoryWithMenuItems) => {
    setActiveId(`category-${category.id}`);
    const el = document.getElementById(`category-${category.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Update the shareable URL with the native History API. A router.replace()
    // here triggers a soft navigation (RSC refetch + the root loading.tsx
    // skeleton), which swaps out the page mid-scroll and kills the smooth
    // scroll — the "first click doesn't move, second click works" bug.
    const params = new URLSearchParams(window.location.search);
    params.set("category", slugifyCategoryName(category.name));
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  };

  return (
    <div className="relative min-h-screen bg-background">
      <div className="px-4 pt-8 sm:px-6 lg:px-8 lg:pt-10">
        <div className="mx-auto max-w-7xl">
          <h1 className="font-display text-[clamp(1.875rem,1.2rem+2.6vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground">
            Our <span className="text-ember-text">Menu</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
            Wok-fired Thai street food. Every plate cooked to order.
          </p>
          <MenuSearchInput value={query} onChange={setQuery} className="mt-5 lg:hidden" />
        </div>
      </div>

      {!isSearching && <SignatureHero items={signatureItems} onSelectItem={handleSelectItem} />}

      {navCategories.length > 0 && (
        <nav
          aria-label="Menu categories"
          className="sticky top-[var(--topbar-h)] z-20 border-b border-border bg-background/95 backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div ref={catbarRef} className="scrollbar-hide flex items-center gap-2 overflow-x-auto py-2.5">
              {navCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  data-cat={`category-${category.id}`}
                  onClick={() => handleClick(category)}
                  className={cn(
                    "inline-flex min-h-[38px] flex-none items-center whitespace-nowrap rounded-full px-3.5 text-xs font-bold transition-colors",
                    activeId === `category-${category.id}`
                      ? "bg-primary text-primary-foreground hover:bg-[var(--accent-hover)]"
                      : "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}

      {categories.length > 0 ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-[minmax(0,248px)_minmax(0,1fr)] lg:gap-10 xl:gap-14">
            <aside className="hidden lg:block">
              <div
                ref={sidebarRef}
                className="relative max-h-[calc(100vh-var(--topbar-h))] overflow-y-auto py-6 pr-1.5 lg:sticky lg:top-[var(--topbar-h)]"
              >
                <MenuSearchInput value={query} onChange={setQuery} />
                <nav aria-label="Menu categories" className="mt-4 flex flex-col gap-0.5">
                  {navCategories.map((category) => {
                    const isActive = activeId === `category-${category.id}`;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        data-cat={`category-${category.id}`}
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => handleClick(category)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[13px] font-semibold leading-5 transition-colors",
                          isActive
                            ? "bg-surface text-ember-text"
                            : "text-muted-foreground hover:bg-surface hover:text-foreground"
                        )}
                      >
                        <span className="min-w-0 truncate">{category.name}</span>
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            isActive ? "text-ember-text/80" : "text-muted-foreground/70"
                          )}
                        >
                          {category.menu_items.length}
                        </span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </aside>

            <div className="min-w-0">
              {navCategories.length > 0 ? (
                <RichMenuGrid categories={navCategories} onSelectItem={handleSelectItem} />
              ) : isSearching ? (
                <div className="flex flex-col items-center gap-2 py-20 text-center">
                  <p className="text-sm font-semibold text-foreground">
                    No items match &ldquo;{query.trim()}&rdquo;
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Try another word — like a dish, an ingredient or a protein.
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="mt-3 inline-flex min-h-10 items-center rounded-full border border-border-2 px-5 text-[13px] font-bold text-foreground transition hover:bg-surface-2"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="py-20 text-center">
                  <p className="text-muted-foreground">No menu items available at the moment.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-7xl px-4 py-12 text-center">
          <p className="text-muted-foreground">No menu items available at the moment.</p>
        </div>
      )}

      {quickViewItemFull && (
        <ItemQuickView item={quickViewItemFull} onClose={closeQuickView} />
      )}
    </div>
  );
}
