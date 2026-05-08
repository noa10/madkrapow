import type { PromoCode } from "@/hooks/use-promos";

export function getPromoStatus(promo: PromoCode): { label: string; color: string; textColor?: string } {
  const now = new Date();
  if (!promo.is_active) return { label: "Inactive", color: "bg-gray-500/20 border-gray-500/30", textColor: "text-gray-400" };
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses)
    return { label: "Depleted", color: "bg-orange-500/20 border-orange-500/30", textColor: "text-orange-400" };
  if (promo.valid_until && new Date(promo.valid_until) < now)
    return { label: "Expired", color: "bg-red-500/20 border-red-500/30", textColor: "text-red-400" };
  if (promo.valid_from && new Date(promo.valid_from) > now)
    return { label: "Scheduled", color: "bg-blue-500/20 border-blue-500/30", textColor: "text-blue-400" };
  return { label: "Active", color: "bg-green-500/20 border-green-500/30", textColor: "text-green-400" };
}

export function getPromoStatusTable(promo: PromoCode): { label: string; color: string } {
  const now = new Date();
  if (!promo.is_active) return { label: "Inactive", color: "bg-gray-500" };
  if (promo.max_uses !== null && promo.current_uses >= promo.max_uses)
    return { label: "Depleted", color: "bg-orange-500" };
  if (promo.valid_until && new Date(promo.valid_until) < now)
    return { label: "Expired", color: "bg-red-500" };
  if (promo.valid_from && new Date(promo.valid_from) > now)
    return { label: "Scheduled", color: "bg-blue-500" };
  return { label: "Active", color: "bg-green-500" };
}

export function formatDiscount(promo: PromoCode): string {
  if (promo.discount_type === "percentage") return `${promo.discount_value}%`;
  return `RM ${(promo.discount_value / 100).toFixed(2)}`;
}

export function formatCurrency(cents: number | null): string {
  if (cents === null || cents === undefined) return "—";
  return `RM ${(cents / 100).toFixed(2)}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-MY", { year: "numeric", month: "short", day: "numeric" });
}
