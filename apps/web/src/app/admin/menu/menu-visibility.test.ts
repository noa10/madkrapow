import { describe, expect, it } from "vitest";
import { visibleMenuCategories, visibleMenuItems } from "./menu-visibility";

const historicalId = "de5a0000-0000-4000-8000-000000000000";

describe("menu management visibility", () => {
  it("hides only the historical category, retaining other inactive categories", () => {
    const categories = [
      { id: historicalId, is_active: false },
      { id: "inactive", is_active: false },
      { id: "active", is_active: true },
    ];
    expect(visibleMenuCategories(categories)).toEqual(categories.slice(1));
    expect(categories).toHaveLength(3);
  });

  it("excludes historical items while retaining items in other inactive categories", () => {
    const items = [
      { id: "old", category_id: historicalId },
      { id: "inactive-item", category_id: "inactive" },
      { id: "active-item", category_id: "active" },
    ];
    expect(visibleMenuItems(items)).toEqual(items.slice(1));
    expect(items).toHaveLength(3);
  });
});
