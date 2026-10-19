"use client";

import { memo } from "react";
import Image from "next/image";
import { Plus } from "lucide-react";
import { useCartStore } from "@/stores/cart";
import type { MenuItemWithModifiers } from "@/lib/queries/menu";
import { SpiceLevel } from "./SpiceLevel";
import { ModifierSummary } from "./ModifierSummary";
import { cn } from "@/lib/utils";

interface RichMenuCardProps {
  item: MenuItemWithModifiers;
  onSelect: (item: MenuItemWithModifiers) => void;
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

export const RichMenuCard = memo(function RichMenuCard({ item, onSelect }: RichMenuCardProps) {
  const unavailable = !item.is_available;
  // Live in-cart count for this item (all modifier variants combined) — the
  // floating badge mirrors it, owner.com style. Primitive selector, so the
  // card only re-renders when its own count changes.
  const cartQuantity = useCartStore((state) =>
    state.items.reduce(
      (sum, line) => (line.menu_item_id === item.id ? sum + line.quantity : sum),
      0
    )
  );

  return (
    // `isolate`: contains the card's internal z-indexes (stretched trigger
    // z-10, "+" badge z-20) in their own stacking context — without it they
    // leak into the root context and, because the cards come after the
    // sticky category rail in the DOM, the "+" (z-20) ties the rail (z-20)
    // and paints on top of it.
    <article
      className={cn(
        "group relative isolate flex h-full overflow-hidden rounded-2xl border border-border bg-surface transition",
        unavailable ? "opacity-60" : "hover:border-border-2"
      )}
    >
      {!unavailable && (
        <button
          type="button"
          onClick={() => onSelect(item)}
          aria-label={
            cartQuantity > 0
              ? `View details for ${item.name}, ${cartQuantity} in cart`
              : `View details for ${item.name}`
          }
          aria-haspopup="dialog"
          className="absolute inset-0 z-10 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3.5 sm:gap-[7px] sm:p-4">
        <SpiceLevel level={item.spice_level ?? 0} size="sm" />
        <h3 className="text-[15px] font-bold leading-snug tracking-[-0.01em] text-foreground sm:text-[17px]">
          {item.name}
        </h3>
        {item.description && (
          <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground sm:line-clamp-3">
            {item.description}
          </p>
        )}
        <ModifierSummary hasModifiers={item.has_modifiers} />
        <span className="mt-auto pt-1 text-[17px] font-extrabold tabular-nums tracking-[-0.01em] text-ember-text">
          {formatPrice(item.price_cents)}
        </span>
      </div>

      <div
        className={cn(
          "relative min-h-[120px] w-28 shrink-0 overflow-hidden bg-surface-sunk sm:min-h-[136px] sm:w-32 xl:w-40",
          unavailable && "grayscale"
        )}
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(min-width: 1280px) 160px, (min-width: 640px) 128px, 112px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            No image
          </div>
        )}

        {!unavailable && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute bottom-2.5 right-2.5 z-20 grid h-9 w-9 place-items-center rounded-full shadow-[0_10px_24px_-10px_rgba(0,0,0,0.8)] ring-1 ring-black/10 sm:h-10 sm:w-10",
              cartQuantity > 0
                ? "bg-primary text-[13px] font-extrabold tabular-nums text-primary-foreground"
                : "bg-foreground text-background"
            )}
          >
            {cartQuantity > 0 ? cartQuantity : <Plus className="h-4 w-4" />}
          </span>
        )}

        {unavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-full border border-border-2 bg-surface-sunk/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground">
              Unavailable
            </span>
          </div>
        )}
      </div>
    </article>
  );
});
