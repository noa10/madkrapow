interface IngredientChipsProps {
  items: string[];
  max?: number;
}

export function IngredientChips({ items, max = 4 }: IngredientChipsProps) {
  if (!items || items.length === 0) return null;
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {visible.map((ing) => (
        <li
          key={ing}
          className="max-w-[7rem] truncate rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
          title={ing}
        >
          {ing}
        </li>
      ))}
      {overflow > 0 && (
        <li className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          +{overflow} more
        </li>
      )}
    </ul>
  );
}
