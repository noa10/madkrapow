"use client";

import Link from "next/link";
import Image from "next/image";
import { buildItemHref } from "@/lib/item-url";
import type { MenuItemWithModifiers } from "@/lib/queries/menu";
import { SpiceLevel } from "./SpiceLevel";
import { HalalBadge } from "./HalalBadge";
import { IngredientChips } from "./IngredientChips";

interface SignatureHeroProps {
  items: MenuItemWithModifiers[];
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

export function SignatureHero({ items }: SignatureHeroProps) {
  const featured = items.slice(0, 2);
  if (featured.length === 0) return null;

  return (
    <section className="relative px-4 pt-10 pb-8 sm:px-6 lg:px-8 lg:pt-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[var(--gold-strong)]">
          <span className="h-2 w-2 rounded-full bg-[var(--gold-strong)]" />
          Chef&apos;s picks
        </div>
        <div className={`grid gap-6 ${featured.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          {featured.map((item) => (
            <article
              key={item.id}
              className="relative overflow-hidden rounded-[2rem] border border-white/8 bg-black/30 shadow-[0_30px_100px_rgba(0,0,0,0.45)]"
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
                  <div className="h-full w-full bg-white/5" />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.2)_0%,rgba(8,8,8,0.92)_80%)]" />
              </div>
              <div className="relative flex min-h-[26rem] flex-col justify-end gap-4 p-8 sm:p-10">
                <div className="flex flex-wrap gap-2">
                  <HalalBadge />
                  <SpiceLevel level={item.spice_level ?? 0} />
                </div>
                <h2 className="font-display text-3xl text-white sm:text-4xl lg:text-5xl">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#f1d7aa] to-[#c59661]">
                    {item.name}
                  </span>
                </h2>
                {item.description && (
                  <p className="max-w-xl text-base leading-7 text-[#d8d1c6]">
                    {item.description}
                  </p>
                )}
                {item.ingredients && item.ingredients.length > 0 && (
                  <IngredientChips items={item.ingredients} max={5} />
                )}
                <div className="mt-2 flex items-center gap-4">
                  <span className="font-display text-2xl text-[var(--gold-strong)]">
                    {formatPrice(item.price_cents)}
                  </span>
                  <Link
                    href={buildItemHref(item.slug, item.name)}
                    className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-7 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.02]"
                  >
                    Order Now
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
