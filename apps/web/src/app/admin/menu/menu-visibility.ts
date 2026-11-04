const HISTORICAL_CATEGORY_ID = "de5a0000-0000-4000-8000-000000000000";

export function visibleMenuCategories<T extends { id: string }>(categories: T[]): T[] {
  return categories.filter((category) => category.id !== HISTORICAL_CATEGORY_ID);
}

export function visibleMenuItems<T extends { category_id: string }>(items: T[]): T[] {
  return items.filter((item) => item.category_id !== HISTORICAL_CATEGORY_ID);
}
