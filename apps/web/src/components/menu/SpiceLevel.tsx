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

  if (clamped === 0) return null;

  const sizeClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

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
            i < clamped ? "fill-ember/40 text-ember" : "text-white/15"
          )}
          aria-hidden
        />
      ))}
    </span>
  );
}
