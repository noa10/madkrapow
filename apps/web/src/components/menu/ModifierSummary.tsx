import { Flame } from "lucide-react";

interface ModifierSummaryProps {
  hasModifiers: boolean;
}

export function ModifierSummary({ hasModifiers }: ModifierSummaryProps) {
  if (!hasModifiers) return null;
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.01em] text-ember-text">
      <Flame className="h-3.5 w-3.5 fill-ember/40 text-ember" aria-hidden />
      Customizable
    </p>
  );
}
