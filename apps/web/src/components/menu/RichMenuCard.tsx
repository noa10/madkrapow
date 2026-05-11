"use client";

import Link from "next/link";
import Image from "next/image";
import { buildItemHref } from "@/lib/item-url";
import type { MenuItemWithModifiers } from "@/lib/queries/menu";
import { SpiceLevel } from "./SpiceLevel";
import { HalalBadge } from "./HalalBadge";
import { IngredientChips } from "./IngredientChips";
import { ModifierSummary } from "./ModifierSummary";
import { cn } from "@/lib/utils";

interface RichMenuCardProps {
  item: MenuItemWithModifiers;
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

export function RichMenuCard({ item }: RichMenuCardProps) {
  const href = buildItemHref(item.slug, item.name);
  const unavailable = !item.is_available;

  return (
    <article
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] backdrop-blur-sm transition",
        unavailable ? "opacity-60" : "hover:border-[var(--line-strong)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
      )}
    >
      <Link
        href={unavailable ? "#" : href}
        aria-label={`View details for ${item.name}`}
        aria-disabled={unavailable}
        tabIndex={unavailable ? -1 : 0}
        className={cn(
          "relative block aspect-[4/3] w-full overflow-hidden",
          unavailable && "pointer-events-none grayscale"
        )}
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-white/5 text-xs uppercase tracking-[0.3em] text-[#9a9388]">
            No image
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-1.5">
          <HalalBadge />
          <SpiceLevel level={item.spice_level ?? 0} size="sm" />
        </div>
        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-full border border-white/20 bg-black/60 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white">
              Unavailable
            </span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div>
          <h3 className="font-display text-xl text-white sm:text-2xl">{item.name}</h3>
          {item.description && (
            <p className="mt-2 text-sm leading-6 text-[#d8d1c6]">{item.description}</p>
          )}
        </div>

        {item.ingredients && item.ingredients.length > 0 && (
          <IngredientChips items={item.ingredients} />
        )}

        <ModifierSummary hasModifiers={item.has_modifiers} />

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="font-display text-xl text-[var(--gold-strong)]">
            {formatPrice(item.price_cents)}
          </span>
          {!unavailable && (
            <Link
              href={href}
              className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.02]"
            >
              Order
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
