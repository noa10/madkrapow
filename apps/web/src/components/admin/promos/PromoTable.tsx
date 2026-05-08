"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PromoCode } from "@/hooks/use-promos";
import { getPromoStatusTable, formatDiscount, formatCurrency, formatDate } from "./utils";
import {
  Tag,
  Truck,
  Percent,
  DollarSign,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

interface PromoTableProps {
  promos: PromoCode[];
  onToggle: (promo: PromoCode) => void;
  onEdit: (promo: PromoCode) => void;
  onDelete: (promo: PromoCode) => void;
  togglingId: string | null;
}

export function PromoTable({ promos, onToggle, onEdit, onDelete, togglingId }: PromoTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
          <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wider">
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Discount</th>
            <th className="px-4 py-3 font-medium">Min Order</th>
            <th className="px-4 py-3 font-medium">Usage</th>
            <th className="px-4 py-3 font-medium">Valid From</th>
            <th className="px-4 py-3 font-medium">Valid Until</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {promos.map((promo) => {
            const status = getPromoStatusTable(promo);
            const isToggling = togglingId === promo.id;
            return (
              <tr
                key={promo.id}
                className="border-b last:border-0 hover:bg-muted/40 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {promo.scope === "delivery" ? (
                      <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-mono font-medium truncate">{promo.code}</div>
                      {promo.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {promo.description}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <Badge variant="outline" className="w-fit text-xs">
                      {promo.scope === "order" ? "Order" : "Delivery"}
                    </Badge>
                    <Badge
                      variant={promo.application_type === "auto" ? "default" : "secondary"}
                      className="w-fit text-xs"
                    >
                      {promo.application_type === "auto" ? "Auto" : "Code"}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 font-medium">
                    {promo.discount_type === "percentage" ? (
                      <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {formatDiscount(promo)}
                  </div>
                </td>
                <td className="px-4 py-3">{formatCurrency(promo.min_order_amount_cents)}</td>
                <td className="px-4 py-3">
                  {promo.max_uses !== null
                    ? `${promo.current_uses}/${promo.max_uses}`
                    : `${promo.current_uses}/∞`}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(promo.valid_from)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(promo.valid_until)}</td>
                <td className="px-4 py-3">
                  <Badge className={cn(`${status.color} text-white text-xs border-0`)}>
                    {status.label}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => onToggle(promo)}
                      disabled={isToggling}
                      aria-label={promo.is_active ? "Deactivate" : "Activate"}
                    >
                      {isToggling ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : promo.is_active ? (
                        <ToggleRight className="h-5 w-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => onEdit(promo)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => onDelete(promo)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
