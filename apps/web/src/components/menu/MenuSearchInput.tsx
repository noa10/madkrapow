"use client";

import { Search, X } from "lucide-react";

interface MenuSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function MenuSearchInput({ value, onChange, className }: MenuSearchInputProps) {
  return (
    <div className={className}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="text"
          inputMode="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search the menu"
          aria-label="Search the menu"
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full rounded-full border border-border bg-surface pl-10 pr-10 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus:border-border-2 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
