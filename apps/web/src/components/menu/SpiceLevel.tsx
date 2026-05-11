"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpiceLevelProps {
  level: number; // 0-3
  size?: "sm" | "md";
}

const LABELS = ["Mild", "Medium", "Hot", "Thai-hot"];

export function SpiceLevel({ level, size = "md" }: SpiceLevelProps) {
  const clamped = Math.max(0, Math.min(3, level));
  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  if (clamped === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[#d8d1c6]"
        aria-label="Spice level mild"
      >
        Mild
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`Spice level ${clamped} of 3 — ${LABELS[clamped]}`}
      role="img"
    >
      {[0, 1, 2].map((i) => (
        <Flame
          key={i}
          className={cn(
            sizeClass,
            i < clamped ? "text-[#e06b4e] fill-[#e06b4e]/40" : "text-white/15"
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
