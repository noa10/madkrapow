import { ShieldCheck } from "lucide-react";

export function HalalBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300"
      aria-label="Halal certified ingredients"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden />
      Halal
    </span>
  );
}
