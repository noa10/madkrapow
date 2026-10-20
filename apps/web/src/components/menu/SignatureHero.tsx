"use client";

import Image from "next/image";
import { Plus } from "lucide-react";
import type { MenuItemWithModifiers } from "@/lib/queries/menu";
import { SpiceLevel } from "./SpiceLevel";

interface SignatureHeroProps {
  items: MenuItemWithModifiers[];
  onSelectItem: (item: MenuItemWithModifiers) => void;
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

export function SignatureHero({ items, onSelectItem }: SignatureHeroProps) {
  const featured = items.slice(0, 2);
  if (featured.length === 0) return null;

  return (
    <section className="relative px-4 pt-8 pb-6 sm:px-6 lg:px-8 lg:pt-10">
      <div className="mx-auto max-w-7xl">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.11em] text-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          Chef&apos;s picks
        </p>
        <div className={`grid gap-3.5 ${featured.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {featured.map((item) => (
            <article
              key={item.id}
              className="relative overflow-hidden rounded-3xl border border-border bg-surface"
            >
              <div className="absolute inset-0">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className="object-cover opacity-60"
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    priority
                  />
                ) : (
                  <div className="h-full w-full bg-surface-2" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/10" />
              </div>
              <div className="relative flex min-h-[24rem] flex-col justify-end gap-3.5 p-6 sm:p-8">
                <SpiceLevel level={item.spice_level ?? 0} />
                <h2 className="font-display text-2xl font-extrabold leading-tight tracking-[-0.02em] text-foreground sm:text-3xl">
                  {item.name}
                </h2>
                {item.description && (
                  <p className="max-w-xl text-[13px] leading-5 text-muted-foreground sm:text-sm sm:leading-6">
                    {item.description}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
                  <span className="text-[22px] font-extrabold tabular-nums tracking-[-0.01em] text-ember-text">
                    {formatPrice(item.price_cents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    aria-haspopup="dialog"
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-5 text-[13px] font-bold text-primary-foreground shadow-[0_6px_18px_-8px_var(--accent)] transition hover:bg-[var(--accent-hover)] active:translate-y-px"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    {item.has_modifiers ? "Customize" : "Order now"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
