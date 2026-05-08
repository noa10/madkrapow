"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusFilter = "all" | "active" | "scheduled" | "expired" | "depleted" | "inactive";
export type ScopeFilter = "all" | "order" | "delivery";
export type AppTypeFilter = "all" | "code" | "auto";

interface PromoFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  status: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
  scope: ScopeFilter;
  onScopeChange: (v: ScopeFilter) => void;
  appType: AppTypeFilter;
  onAppTypeChange: (v: AppTypeFilter) => void;
}

const STATUS_OPTIONS: { value: StatusFilter; label: string; color: string }[] = [
  { value: "active", label: "Active", color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { value: "scheduled", label: "Scheduled", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { value: "expired", label: "Expired", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  { value: "depleted", label: "Depleted", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  { value: "inactive", label: "Inactive", color: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
];

const SCOPE_OPTIONS: { value: ScopeFilter; label: string }[] = [
  { value: "order", label: "Order" },
  { value: "delivery", label: "Delivery" },
];

const APP_OPTIONS: { value: AppTypeFilter; label: string }[] = [
  { value: "code", label: "Code" },
  { value: "auto", label: "Auto" },
];

function ToggleChip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-sm font-medium border transition-all min-h-[36px]",
        active
          ? className
          : "bg-transparent border-border text-muted-foreground hover:border-muted-foreground/50"
      )}
    >
      {children}
    </button>
  );
}

export function PromoFilterSheet({
  isOpen,
  onClose,
  status,
  onStatusChange,
  scope,
  onScopeChange,
  appType,
  onAppTypeChange,
}: PromoFilterSheetProps) {
  const hasFilters = status !== "all" || scope !== "all" || appType !== "all";

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-card shadow-2xl transition-transform duration-300 lg:hidden",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Filter promotions"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted" />
        </div>

        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-border">
          <h2 className="text-lg font-semibold font-display">Filters</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close filters"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Status */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">Status</h3>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <ToggleChip
                  key={opt.value}
                  active={status === opt.value}
                  onClick={() => onStatusChange(status === opt.value ? "all" : opt.value)}
                  className={opt.color}
                >
                  {opt.label}
                </ToggleChip>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">Scope</h3>
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((opt) => (
                <ToggleChip
                  key={opt.value}
                  active={scope === opt.value}
                  onClick={() => onScopeChange(scope === opt.value ? "all" : opt.value)}
                  className="bg-primary/15 text-primary border-primary/30"
                >
                  {opt.label}
                </ToggleChip>
              ))}
            </div>
          </div>

          {/* Application Type */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">Type</h3>
            <div className="flex flex-wrap gap-2">
              {APP_OPTIONS.map((opt) => (
                <ToggleChip
                  key={opt.value}
                  active={appType === opt.value}
                  onClick={() => onAppTypeChange(appType === opt.value ? "all" : opt.value)}
                  className="bg-primary/15 text-primary border-primary/30"
                >
                  {opt.label}
                </ToggleChip>
              ))}
            </div>
          </div>
        </div>

        {hasFilters && (
          <div className="px-5 py-3 border-t border-border">
            <button
              onClick={() => {
                onStatusChange("all");
                onScopeChange("all");
                onAppTypeChange("all");
              }}
              className="w-full py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Desktop inline filters */}
      <div className="hidden lg:flex items-center gap-2 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <ToggleChip
            key={opt.value}
            active={status === opt.value}
            onClick={() => onStatusChange(status === opt.value ? "all" : opt.value)}
            className={opt.color}
          >
            {opt.label}
          </ToggleChip>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        {SCOPE_OPTIONS.map((opt) => (
          <ToggleChip
            key={opt.value}
            active={scope === opt.value}
            onClick={() => onScopeChange(scope === opt.value ? "all" : opt.value)}
            className="bg-primary/15 text-primary border-primary/30"
          >
            {opt.label}
          </ToggleChip>
        ))}
        {APP_OPTIONS.map((opt) => (
          <ToggleChip
            key={opt.value}
            active={appType === opt.value}
            onClick={() => onAppTypeChange(appType === opt.value ? "all" : opt.value)}
            className="bg-primary/15 text-primary border-primary/30"
          >
            {opt.label}
          </ToggleChip>
        ))}
        {hasFilters && (
          <button
            onClick={() => {
              onStatusChange("all");
              onScopeChange("all");
              onAppTypeChange("all");
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
          >
            Clear
          </button>
        )}
      </div>
    </>
  );
}
