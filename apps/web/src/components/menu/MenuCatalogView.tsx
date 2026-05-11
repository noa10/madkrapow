"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { CategoryWithMenuItems } from "@/lib/queries/menu";
import { SignatureHero } from "./SignatureHero";
import { RichMenuGrid } from "./RichMenuGrid";
import { cn } from "@/lib/utils";

interface MenuCatalogViewProps {
  categories: CategoryWithMenuItems[];
}

function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function MenuCatalogView({ categories }: MenuCatalogViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const allItems = categories.flatMap((c) => c.menu_items);
  const signatureItems = allItems.filter((i) => i.is_signature).slice(0, 2);
  const signatureIds = new Set(signatureItems.map((i) => i.id));
  const nonSignatureByCategory: CategoryWithMenuItems[] = categories.map((c) => ({
    ...c,
    menu_items: c.menu_items.filter((i) => !signatureIds.has(i.id)),
  }));

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const sorted = visible.sort(
            (a, b) => b.boundingClientRect.top - a.boundingClientRect.top
          );
          setActiveId(sorted[0].target.id);
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );
    categories.forEach((c) => {
      const el = document.getElementById(`category-${c.id}`);
      if (el) observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, [categories]);

  const handleClick = (category: CategoryWithMenuItems) => {
    const el = document.getElementById(`category-${category.id}`);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: "smooth" });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("category", slugifyCategoryName(category.name));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,176,123,0.18),transparent_30%),linear-gradient(180deg,rgba(8,8,8,0.92)_0%,rgba(8,8,8,1)_100%)]" />
      <div className="relative">
        <div className="px-4 pt-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h1 className="font-display text-4xl text-white sm:text-5xl lg:text-6xl">
              Our{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#f1d7aa] to-[#c59661]">
                Menu
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#d8d1c6] sm:text-lg">
              Wok-fired Thai street food, made with 100% halal-sourced ingredients. Every plate cooked to order.
            </p>
          </div>
        </div>

        <SignatureHero items={signatureItems} />

        {categories.length > 0 && (
          <nav className="sticky top-16 z-40 border-b border-white/10 bg-background/80 backdrop-blur-md lg:top-0">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleClick(category)}
                    className={cn(
                      "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
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
        )}

        {categories.length > 0 ? (
          <RichMenuGrid categories={nonSignatureByCategory} />
        ) : (
          <div className="mx-auto max-w-7xl px-4 py-12 text-center">
            <p className="text-[#d8d1c6]">No menu items available at the moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
