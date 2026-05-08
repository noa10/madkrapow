"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PromoCode } from "@/hooks/use-promos";
import { getPromoStatus, formatDiscount, formatCurrency, formatDate } from "./utils";
import {
  Tag,
  Truck,
  Percent,
  DollarSign,
  Calendar,
  ToggleLeft,
  ToggleRight,
  Loader2,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
} from "lucide-react";

interface PromoCardProps {
  promo: PromoCode;
  onToggle: (promo: PromoCode) => void;
  onEdit: (promo: PromoCode) => void;
  onDelete: (promo: PromoCode) => void;
  togglingId: string | null;
}

export function PromoCard({ promo, onToggle, onEdit, onDelete, togglingId }: PromoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const status = getPromoStatus(promo);
  const isToggling = togglingId === promo.id;

  return (
    <div className="relative rounded-xl border border-border bg-card p-4 shadow-sm active:scale-[0.99] transition-transform duration-150">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-base font-semibold text-foreground truncate">
              {promo.code}
            </span>
            <Badge
              variant="outline"
              className={cn("text-[11px] font-medium px-1.5 py-0", status.color, status.textColor)}
            >
              {status.label}
            </Badge>
          </div>
          {promo.description && (
            <p className="text-sm text-muted-foreground truncate">{promo.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle */}
          <button
            onClick={() => onToggle(promo)}
            disabled={isToggling}
            className="p-2 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
            aria-label={promo.is_active ? "Deactivate promotion" : "Activate promotion"}
          >
            {isToggling ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : promo.is_active ? (
              <ToggleRight className="h-6 w-6 text-green-500" />
            ) : (
              <ToggleLeft className="h-6 w-6 text-muted-foreground" />
            )}
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-2 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="More actions"
              aria-expanded={menuOpen}
            >
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border bg-popover shadow-lg py-1">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit(promo);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(promo);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Discount badge + dates */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold",
            promo.application_type === "auto"
              ? "bg-primary/15 text-primary border border-primary/20"
              : "bg-muted text-foreground border border-border"
          )}
        >
          {promo.discount_type === "percentage" ? (
            <Percent className="h-3.5 w-3.5" />
          ) : (
            <DollarSign className="h-3.5 w-3.5" />
          )}
          {formatDiscount(promo)} OFF
        </span>

        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(promo.valid_from)} – {formatDate(promo.valid_until)}
        </span>
      </div>

      {/* Type tags */}
      <div className="flex items-center gap-1.5 mt-2">
        <Badge variant="outline" className="text-[11px] px-1.5 py-0">
          {promo.scope === "order" ? (
            <Tag className="h-3 w-3 mr-1 inline" />
          ) : (
            <Truck className="h-3 w-3 mr-1 inline" />
          )}
          {promo.scope === "order" ? "Order" : "Delivery"}
        </Badge>
        <Badge
          variant={promo.application_type === "auto" ? "default" : "secondary"}
          className="text-[11px] px-1.5 py-0"
        >
          {promo.application_type === "auto" ? "Auto" : "Code"}
        </Badge>
      </div>

      {/* Expandable details */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? "Hide details" : "View details"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Min Order</span>
            <span className="font-medium">{formatCurrency(promo.min_order_amount_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Usage</span>
            <span className="font-medium">
              {promo.max_uses !== null ? `${promo.current_uses}/${promo.max_uses}` : `${promo.current_uses}/∞`}
            </span>
          </div>
          {promo.max_uses !== null && promo.max_uses > 0 && (
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, (promo.current_uses / promo.max_uses) * 100)}%` }}
              />
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max Discount</span>
            <span className="font-medium">{formatCurrency(promo.max_discount_cents)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
