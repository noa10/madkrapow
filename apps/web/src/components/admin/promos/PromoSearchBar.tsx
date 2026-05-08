"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal, X } from "lucide-react";

interface PromoSearchBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onFilterClick: () => void;
  resultCount: number;
  totalCount: number;
}

export function PromoSearchBar({
  searchQuery,
  onSearchChange,
  onFilterClick,
  resultCount,
  totalCount,
}: PromoSearchBarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="sticky top-0 z-20 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3 bg-background/95 backdrop-blur-sm border-b border-border/50 lg:static lg:bg-transparent lg:border-0 lg:px-0 lg:py-0 lg:mx-0">
      {/* Mobile: Title row */}
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <h1 className="text-xl font-bold font-display">Promotions</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-2.5 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={expanded ? "Close search" : "Search promotions"}
          >
            {expanded ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </button>
          <button
            onClick={onFilterClick}
            className="p-2.5 rounded-lg hover:bg-muted transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Filter promotions"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Expanded search on mobile */}
      {expanded && (
        <div className="mt-3 lg:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by code or description..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 bg-background pr-9"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => {
                  onSearchChange("");
                  setExpanded(false);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Desktop: Full search + filter bar */}
      <div className="hidden lg:flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold font-display">Promotions</h1>
          <span className="text-sm text-muted-foreground">
            {resultCount} of {totalCount}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search promos..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 bg-background"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onFilterClick} className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>
    </div>
  );
}
