"use client";

import { Tag, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PromoEmptyStateProps {
  onCreate: () => void;
  hasFilters: boolean;
}

export function PromoEmptyState({ onCreate, hasFilters }: PromoEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-8 sm:p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Tag className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold font-display text-foreground mb-1">
        {hasFilters ? "No matching promotions" : "No promotions yet"}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-xs">
        {hasFilters
          ? "Try adjusting your search or filter criteria."
          : "Create your first promotion to start offering discounts to customers."}
      </p>
      {!hasFilters && (
        <Button
          onClick={onCreate}
          className="shadow-gold"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Promotion
        </Button>
      )}
    </div>
  );
}
