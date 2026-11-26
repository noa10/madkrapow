const HISTORICAL_CATEGORY_ID = "de5a0000-0000-4000-8000-000000000000";

export function visibleMenuCategories<T extends { id: string; archived_at?: string | null }>(categories: T[]): T[] {
  return categories.filter((category) => category.id !== HISTORICAL_CATEGORY_ID && !category.archived_at);
}

export function visibleMenuItems<T extends { category_id: string; archived_at?: string | null }>(items: T[]): T[] {
  return items.filter((item) => item.category_id !== HISTORICAL_CATEGORY_ID && !item.archived_at);
}

/** PostgREST returns 42703 when a migration has not added a selected column. */
export function isMissingColumnError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "42703";
}

/**
 * Preserve an existing group's selection range unless the control type or
 * required flag actually changes, so renaming cannot rewrite min/max.
 */
export function resolveGroupSelectionRange(input: {
  id?: string;
  type: "radio" | "checkbox";
  required: boolean;
  minSelections?: number;
  maxSelections?: number;
}): { minSelections: number; maxSelections: number } {
  const wasRequired = (input.minSelections ?? 0) > 0;
  const wasRadio = (input.maxSelections ?? 1) === 1;
  const minSelections = input.id
    ? input.required === wasRequired
      ? input.minSelections ?? 0
      : input.required ? 1 : 0
    : input.required ? 1 : 0;
  const maxSelections = input.id
    ? input.type === (wasRadio ? "radio" : "checkbox")
      ? input.maxSelections ?? (wasRadio ? 1 : 10)
      : input.type === "radio" ? 1 : Math.max(10, input.maxSelections ?? 10)
    : input.type === "radio" ? 1 : 10;
  return { minSelections: Math.min(minSelections, maxSelections), maxSelections };
}
