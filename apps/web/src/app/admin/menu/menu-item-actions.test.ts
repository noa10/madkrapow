import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MenuItemActions } from "./menu-item-actions";

const props = {
  id: "item-1",
  name: "Basil chicken",
  isSaving: false,
  onDeleteStart: () => {},
  onDelete: () => {},
  onDeleteCancel: () => {},
};

describe("menu item actions", () => {
  it("offers named edit and delete controls", () => {
    const html = renderToStaticMarkup(createElement(MenuItemActions, { ...props, isDeleting: false }));
    expect(html).toContain('aria-label="Edit Basil chicken"');
    expect(html).toContain('aria-label="Delete Basil chicken"');
    expect(html).toContain('/admin/menu/items/item-1');
  });

  it("replaces the action controls with named confirmation and cancellation", () => {
    const html = renderToStaticMarkup(createElement(MenuItemActions, { ...props, isDeleting: true }));
    expect(html).toContain('aria-label="Confirm delete Basil chicken"');
    expect(html).toContain('aria-label="Cancel delete Basil chicken"');
    expect(html).not.toContain('aria-label="Edit Basil chicken"');
  });
});
