interface ModifierSummaryProps {
  hasModifiers: boolean;
}

export function ModifierSummary({ hasModifiers }: ModifierSummaryProps) {
  if (!hasModifiers) return null;
  return (
    <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--gold-strong)]">
      Customizable
    </p>
  );
}
