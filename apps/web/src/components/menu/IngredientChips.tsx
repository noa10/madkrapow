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
          className="max-w-[7rem] truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-[#d8d1c6]"
          title={ing}
        >
          {ing}
        </li>
      ))}
      {overflow > 0 && (
        <li className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-[#9a9388]">
          +{overflow} more
        </li>
      )}
    </ul>
  );
}
