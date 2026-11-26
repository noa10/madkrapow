import { describe, expect, it } from "vitest";
import { isMissingColumnError, resolveGroupSelectionRange, visibleMenuCategories, visibleMenuItems } from "./menu-visibility";

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

describe("group selection range", () => {
  it("preserves an existing min and max when only the name changes", () => {
    expect(resolveGroupSelectionRange({ id: "g", type: "checkbox", required: true, minSelections: 2, maxSelections: 3 }))
      .toEqual({ minSelections: 2, maxSelections: 3 });
  });

  it("uses the control type defaults for a new group", () => {
    expect(resolveGroupSelectionRange({ type: "radio", required: false })).toEqual({ minSelections: 0, maxSelections: 1 });
    expect(resolveGroupSelectionRange({ type: "checkbox", required: true })).toEqual({ minSelections: 1, maxSelections: 10 });
  });

  it("changes the range when the admin changes required or the control type", () => {
    expect(resolveGroupSelectionRange({ id: "g", type: "checkbox", required: true, minSelections: 0, maxSelections: 3 }))
      .toEqual({ minSelections: 1, maxSelections: 3 });
    expect(resolveGroupSelectionRange({ id: "g", type: "radio", required: true, minSelections: 2, maxSelections: 3 }))
      .toEqual({ minSelections: 1, maxSelections: 1 });
  });
});

describe("missing column detection", () => {
  it("recognises PostgREST 42703 and ignores other errors", () => {
    expect(isMissingColumnError({ code: "42703" })).toBe(true);
    expect(isMissingColumnError({ code: "23502" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});
