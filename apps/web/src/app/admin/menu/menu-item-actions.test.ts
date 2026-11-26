import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MenuItemActions } from "./menu-item-actions";

const props = {
  id: "item-1",
  name: "Basil chicken",
  isSaving: false,
  autoFocusDelete: false,
  onDeleteStart: () => {},
  onDelete: () => {},
  onDeleteCancel: () => {},
};

function buttonWithLabel(html: string, label: string) {
  return (html.match(/<button[^>]*>/g) ?? []).find((tag) => tag.includes(`aria-label="${label}"`));
}

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

  it("warns that deletion removes the item and links the warning to the confirmation", () => {
    const html = renderToStaticMarkup(createElement(MenuItemActions, { ...props, isDeleting: true }));
    expect(html).toContain('id="item-delete-warning-item-1"');
    expect(html).toContain("This removes Basil chicken from active menus. Past orders keep their history.");
    expect(buttonWithLabel(html, "Confirm delete Basil chicken")).toContain('aria-describedby="item-delete-warning-item-1"');
    expect(buttonWithLabel(html, "Confirm delete Basil chicken")).toContain("autofocus");
  });

  it("restores focus to the delete control when requested", () => {
    const html = renderToStaticMarkup(createElement(MenuItemActions, { ...props, isDeleting: false, autoFocusDelete: true }));
    expect(buttonWithLabel(html, "Delete Basil chicken")).toContain("autofocus");
    const normal = renderToStaticMarkup(createElement(MenuItemActions, { ...props, isDeleting: false }));
    expect(buttonWithLabel(normal, "Delete Basil chicken")).not.toContain("autofocus");
  });
});
