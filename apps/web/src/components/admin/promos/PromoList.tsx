"use client";

import type { PromoCode } from "@/hooks/use-promos";
import { PromoCard } from "./PromoCard";
import { PromoTable } from "./PromoTable";
import { PromoEmptyState } from "./PromoEmptyState";
import { PromoCardSkeleton, PromoTableSkeleton } from "./PromoSkeleton";

interface PromoListProps {
  promos: PromoCode[];
  loading: boolean;
  onToggle: (promo: PromoCode) => void;
  onEdit: (promo: PromoCode) => void;
  onDelete: (promo: PromoCode) => void;
  togglingId: string | null;
  onCreate: () => void;
  hasFilters: boolean;
}

export function PromoList({
  promos,
  loading,
  onToggle,
  onEdit,
  onDelete,
  togglingId,
  onCreate,
  hasFilters,
}: PromoListProps) {
  if (loading) {
    return (
      <>
        <div className="lg:hidden space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <PromoCardSkeleton key={i} />
          ))}
        </div>
        <div className="hidden lg:block">
          <PromoTableSkeleton />
        </div>
      </>
    );
  }

  if (promos.length === 0) {
    return (
      <div className="py-4">
        <PromoEmptyState onCreate={onCreate} hasFilters={hasFilters} />
      </div>
    );
  }

  return (
    <>
      <div className="lg:hidden space-y-3">
        {promos.map((promo) => (
          <PromoCard
            key={promo.id}
            promo={promo}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
            togglingId={togglingId}
          />
        ))}
      </div>
      <div className="hidden lg:block">
        <PromoTable
          promos={promos}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
          togglingId={togglingId}
        />
      </div>
    </>
  );
}
