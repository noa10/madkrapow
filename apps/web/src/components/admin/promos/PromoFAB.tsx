"use client";

import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromoFABProps {
  onClick: () => void;
}

export function PromoFAB({ onClick }: PromoFABProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed z-40 flex items-center justify-center rounded-full shadow-lg transition-transform",
        "lg:hidden",
        "bg-primary text-primary-foreground",
        "hover:scale-105 active:scale-95",
        "w-14 h-14"
      )}
      style={{
        right: "calc(1rem + env(safe-area-inset-right, 0px))",
        bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
        boxShadow: "0 4px 20px rgba(210, 176, 123, 0.35)",
      }}
      aria-label="New Promotion"
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} />
    </button>
  );
}
