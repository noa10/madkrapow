import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[], index: 0, client: vi.fn(), invalidate: vi.fn(), notify: vi.fn(),
  toast: vi.fn(), effects: [] as Array<() => unknown>,
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.index++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => {
      harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value;
    }];
  },
  useEffect: (effect: () => unknown) => { harness.effects.push(effect); },
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock("@/hooks/use-role-guard", () => ({ useRoleGuard: () => ({ hasAccess: true, isLoading: false }) }));
vi.mock("@/stores/toast", () => ({ useToastStore: () => ({ addToast: harness.toast }) }));
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient: harness.client }));
vi.mock("@/lib/admin/menu-cache", () => ({ notifyMenuChanged: harness.invalidate }));
vi.mock("@/lib/grabfood/notify-client", () => ({ notifyGrabMenuAfterChange: harness.notify }));
vi.mock("@dnd-kit/sortable", async (importOriginal) => ({
  ...await importOriginal<typeof import("@dnd-kit/sortable")>(),
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null, transition: undefined, isDragging: false }),
}));

const { default: AdminMenuPage } = await import("./page");

function nodes(node: unknown, predicate: (props: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, predicate));
  if (!node || typeof node !== "object") return [];
  const props = (node as { props?: Record<string, unknown> }).props;
  return props ? [...(predicate(props) ? [props] : []), ...nodes(props.children, predicate)] : [];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return text((node as { props?: { children?: unknown } }).props?.children);
}
function render() { harness.index = 0; return AdminMenuPage(); }
async function runEffects() {
  const effects = harness.effects.splice(0);
  for (const effect of effects) await effect();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
function renderExpanded() {
  const expand = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    const element = node as { type?: unknown; props?: Record<string, unknown> };
    if (!element.props) return node;
    if (typeof element.type === "function" && "modifier" in element.props && "isDeleting" in element.props) {
      return expand((element.type as (props: Record<string, unknown>) => unknown)(element.props));
    }
    return { ...element, props: { ...element.props, children: expand(element.props.children) } };
  };
  return expand(render());
}

const category = { id: "cat", name: "Mains", is_active: true };
const item = { id: "item", category_id: "cat", name: "Basil chicken", sort_order: 0 };
const group = { id: "group", name: "Extras", min_selections: 0, max_selections: 1, modifiers: [{ id: "option", name: "Egg" }] };

function setup(section: "items" | "categories" | "modifiers", failure?: unknown) {
  const requests: string[] = [];
  harness.states = [];
  harness.states[0] = [item];
  harness.states[1] = [category];
  harness.states[2] = section;
  harness.states[3] = false;
  harness.states[9] = category;
  harness.states[12] = { id: item.id, name: item.name };
  harness.states[14] = [group];
  harness.states[15] = new Set(["group"]);
  harness.states[18] = "group";
  harness.states[19] = "option";
  harness.client.mockReturnValue({ from: (table: string) => {
    let operation = "read";
    let selection = "";
    const builder = {
      delete() { operation = "delete"; return builder; },
      select(value?: string) { selection = value ?? ""; return builder; }, order() { return builder; }, in() { return builder; },
      eq(column: string, value: string) { if (operation === "delete") requests.push(`${table}:${column}:${value}`); return builder; },
      then(resolve: (value: unknown) => void) {
        const data = operation === "read" && selection === "archived_at" ? [{ archived_at: "2026-11-26T00:00:00Z" }] : [];
        resolve({ data: operation === "read" ? data : null, error: operation === "delete" ? failure ?? null : null });
      },
    };
    return builder;
  } });
  return requests;
}

beforeEach(() => { harness.client.mockReset(); harness.invalidate.mockReset(); harness.notify.mockReset(); harness.notify.mockResolvedValue(null); harness.toast.mockReset(); harness.effects = []; });

describe("menu deletion", () => {
  it.each([
    ["items", "item"], ["categories", "category"], ["modifiers", "group"], ["modifiers", "option"],
  ] as const)("keeps the %s menu usable when deleting a %s returns a Supabase error", async (section, kind) => {
    const requests = setup(section, { message: "Referenced by an existing order", code: "23502", details: "", hint: "" });
    const page = render();
    let onDelete: () => Promise<void>;
    if (kind === "item") onDelete = nodes(page, (props) => (props.item as { id?: string } | undefined)?.id === "item")[0].onDelete as typeof onDelete;
    else if (kind === "option") onDelete = nodes(page, (props) => (props.modifier as { id?: string } | undefined)?.id === "option")[0].onDelete as typeof onDelete;
    else onDelete = nodes(page, (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as typeof onDelete;
    await onDelete();
    const after = render();
    expect(text(after)).toContain("Menu management");
    expect(text(after)).toContain("Referenced by an existing order");
    expect(nodes(after, (props) => props.role === "alert")).toHaveLength(1);
    expect(text(after)).toContain("Dismiss it to keep managing the menu");
    const dismiss = nodes(after, (props) => props.children === "Dismiss")[0].onClick as () => void;
    dismiss();
    expect(nodes(render(), (props) => props.role === "alert")).toHaveLength(0);
    expect(harness.invalidate).not.toHaveBeenCalled();
    expect(harness.notify).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
  });

  it("warns that deleting a category removes its items from active menus and cannot be undone", () => {
    setup("categories");
    const page = render();
    expect(text(page)).toMatch(/1 item.*active menus/i);
    expect(text(page)).toMatch(/mappings are kept/i);
    expect(text(page)).toMatch(/cannot be restored here/i);
  });

  it("warns that deleting a group removes its options and assignments from active menus", () => {
    setup("modifiers");
    const page = render();
    expect(text(page)).toMatch(/1 option.*active menus/i);
    expect(text(page)).toMatch(/item.*assignments/i);
  });

  it("hides archived categories and items while retaining rows without archived_at", () => {
    setup("categories");
    harness.states[0] = [item, { ...item, id: "old-item", archived_at: "2026-11-26T00:00:00Z" }];
    harness.states[1] = [category, { ...category, id: "old-cat", name: "Archived category", archived_at: "2026-11-26T00:00:00Z" }];
    const page = render();
    expect(text(page)).toContain("Mains");
    expect(text(page)).not.toContain("Archived category");
    expect(text(page)).toContain("1 item");
  });

  it("hides archived groups and options while retaining rows without archived_at", () => {
    setup("modifiers");
    harness.states[14] = [
      { ...group, modifiers: [...group.modifiers, { id: "old-option", name: "Archived option", archived_at: "2026-11-26T00:00:00Z" }] },
      { ...group, id: "old-group", name: "Archived group", archived_at: "2026-11-26T00:00:00Z" },
    ];
    const page = render();
    expect(text(page)).toContain("Extras");
    expect(text(page)).not.toContain("Archived group");
    expect(nodes(page, (props) => (props.modifier as { id?: string } | undefined)?.id === "old-option")).toHaveLength(0);
    expect(nodes(page, (props) => (props.modifier as { id?: string } | undefined)?.id === "option")).toHaveLength(1);
  });

  it.each(["categories", "modifiers"] as const)("keeps archived rows hidden after the %s delete refresh", async (section) => {
    setup(section);
    const archived = "2026-11-26T00:00:00Z";
    const rows: Record<string, Record<string, unknown>[]> = {
      categories: [category, { ...category, id: "old-cat", name: "Archived category", archived_at: archived }],
      menu_items: [item, { ...item, id: "old-item", archived_at: archived }],
      modifier_groups: [group, { ...group, id: "old-group", name: "Archived group", archived_at: archived }],
      modifiers: [{ ...group.modifiers[0], modifier_group_id: "group" }, { id: "old-option", modifier_group_id: "group", archived_at: archived }],
    };
    harness.client.mockReturnValue({ from: (table: string) => {
      let selection = "";
      let deleting = false;
      const builder = {
        delete() { deleting = true; return builder; },
        select(value: string) { selection = value; return builder; },
        order() { return builder; }, in() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => void) {
          if (selection === "archived_at") {
            resolve({ data: [{ archived_at: archived }], error: null });
            return;
          }
          const data = (rows[table] ?? []).map((row) => selection.includes("*") ? row : Object.fromEntries(Object.entries(row).filter(([key]) => key !== "archived_at")));
          resolve({ data: deleting ? null : data, error: null });
        },
      };
      return builder;
    } });
    const confirm = nodes(render(), (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;
    await confirm();
    const after = render();
    expect(text(after)).not.toContain("Archived category");
    expect(text(after)).not.toContain("Archived group");
    if (section === "categories") expect(text(after)).toContain("1 item");
    else expect(nodes(after, (props) => (props.modifier as { id?: string } | undefined)?.id === "old-option")).toHaveLength(0);
  });

  it("disables saving bindings while the selected item's assignments are loading", () => {
    setup("modifiers");
    harness.states[20] = "item";
    harness.states[21] = { group: { bound: true, required: false } };
    harness.states[22] = true;
    const page = render();
    const save = nodes(page, (props) => props.children === "Save Bindings")[0];
    expect(save.disabled).toBe(true);
    const rpc = vi.fn();
    harness.client.mockReturnValue({ rpc, from: () => ({ select: () => ({ eq: () => ({ then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) }) }) }) });
    (save.onClick as () => void)();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a missing archived_at column as a successful hard delete", async () => {
    setup("categories");
    harness.client.mockReturnValue({ from: (table: string) => {
      let operation = "read";
      let selection = "";
      const builder = {
        delete() { operation = "delete"; return builder; },
        select(value?: string) { selection = value ?? ""; return builder; }, order() { return builder; }, in() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => void) {
          if (operation === "read" && selection === "archived_at") {
            resolve({ data: null, error: { code: "42703", message: "column categories.archived_at does not exist" } });
            return;
          }
          resolve({ data: operation === "read" ? (table === "categories" ? [category] : [item]) : null, error: null });
        },
      };
      return builder;
    } });
    const page = render();
    const confirm = nodes(page, (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;
    await confirm();
    expect(harness.invalidate).toHaveBeenCalledOnce();
    expect(harness.notify).toHaveBeenCalledOnce();
    expect(harness.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Menu section deleted/) }));
    expect(text(render())).not.toContain("Could not delete category");
  });

  it("deletes a group in one request and preserves change notifications", async () => {
    const requests = setup("modifiers");
    const page = render();
    const confirm = nodes(page, (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;
    await confirm();
    expect(requests).toEqual(["modifier_groups:id:group"]);
    expect(harness.invalidate).toHaveBeenCalledOnce();
    expect(harness.notify).toHaveBeenCalledOnce();
    expect(harness.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Option group deleted/) }));
    expect(harness.states[18]).toBeNull();
  });

  it("shows a retryable warning when Grab cannot be notified after a delete", async () => {
    setup("modifiers");
    harness.notify.mockResolvedValue("Grab API 429");
    const page = render();
    const confirm = nodes(page, (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;
    await confirm();

    const warning = harness.toast.mock.calls
      .map((call) => call[0] as { type?: string; title?: string; description?: string; action?: { label?: string; onClick?: () => void } })
      .find((toast) => toast.type === "warning");
    expect(warning).toMatchObject({
      type: "warning",
      title: expect.stringMatching(/Grab sync will retry/),
      description: "Grab API 429",
      action: expect.objectContaining({ label: "Retry Grab sync" }),
    });
    expect(harness.toast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));

    warning?.action?.onClick?.();
    expect(harness.notify).toHaveBeenCalledTimes(2);
  });

  function clientWithRefreshFailure(failure: { message: string }) {
    harness.client.mockReturnValue({ from: () => {
      let operation = "read";
      let selection = "";
      const builder = {
        delete() { operation = "delete"; return builder; },
        select(value?: string) { selection = value ?? ""; return builder; }, order() { return builder; }, in() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => void) {
          if (operation === "read" && selection === "archived_at") {
            resolve({ data: [{ archived_at: "2026-11-26T00:00:00Z" }], error: null });
            return;
          }
          resolve({ data: null, error: operation === "delete" ? null : failure });
        },
      };
      return builder;
    } });
  }

  function clientWithUnconfirmedDelete() {
    harness.client.mockReturnValue({ from: () => {
      let operation = "read";
      let selection = "";
      const builder = {
        delete() { operation = "delete"; return builder; },
        select(value?: string) { selection = value ?? ""; return builder; }, order() { return builder; }, in() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => void) {
          resolve({ data: operation === "read" && selection === "archived_at" ? [] : null, error: null });
        },
      };
      return builder;
    } });
  }

  function clientWithWriteFailure(failure: { message: string }) {
    harness.client.mockReturnValue({ from: () => {
      let operation = "read";
      const builder = {
        insert() { operation = "insert"; return builder; },
        update() { operation = "update"; return builder; },
        select() { return builder; }, order() { return builder; }, in() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => void) {
          resolve({ data: null, error: operation === "read" ? null : failure });
        },
      };
      return builder;
    } });
  }

  it("preserves the category list and asks for a reload when the delete refresh fails", async () => {
    setup("categories");
    clientWithRefreshFailure({ message: "refresh failed" });
    const page = render();
    const confirm = nodes(page, (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;
    await confirm();
    const after = render();
    expect(text(after)).toContain("Mains");
    expect(text(after)).toContain("Category deleted, but the menu could not be refreshed");
    expect(text(after)).toContain("Reload the page");
  });

  it("preserves the item list and asks for a reload when the delete refresh fails", async () => {
    setup("items");
    clientWithRefreshFailure({ message: "refresh failed" });
    const page = render();
    const onDelete = nodes(page, (props) => (props.item as { id?: string } | undefined)?.id === "item")[0].onDelete as () => Promise<void>;
    await onDelete();
    const after = render();
    expect(nodes(after, (props) => (props.item as { id?: string } | undefined)?.id === "item")).toHaveLength(1);
    expect(text(after)).toContain("Item deleted, but the menu could not be refreshed");
    expect(text(after)).toContain("Reload the page");
  });

  it("reports a group delete as committed when only the refresh fails", async () => {
    setup("modifiers");
    clientWithRefreshFailure({ message: "refresh failed" });
    const page = render();
    const confirm = nodes(page, (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;
    await confirm();
    const after = render();
    expect(text(after)).toContain("Extras");
    expect(text(after)).toContain("Option group deleted, but the options list could not be refreshed");
    expect(text(after)).not.toContain("Could not delete option group");
  });

  it("reports an option delete as committed when only the refresh fails", async () => {
    setup("modifiers");
    clientWithRefreshFailure({ message: "refresh failed" });
    const page = render();
    const onDelete = nodes(page, (props) => (props.modifier as { id?: string } | undefined)?.id === "option")[0].onDelete as () => Promise<void>;
    await onDelete();
    const after = render();
    expect(nodes(after, (props) => (props.modifier as { id?: string } | undefined)?.id === "option")).toHaveLength(1);
    expect(text(after)).toContain("Option deleted, but the options list could not be refreshed");
    expect(text(after)).not.toContain("Could not delete option");
  });

  it.each([
    ["create", null, "New Category"],
    ["update", category, "Edit Category"],
  ] as const)("shows a category %s error inside the open form", async (_label, editingCategory, title) => {
    setup("categories");
    harness.states[7] = true;
    harness.states[8] = editingCategory;
    harness.states[10] = { name: editingCategory ? "Mains" : "Desserts", description: "" };
    clientWithWriteFailure({ message: "Category name already exists" });
    const page = render();
    expect(text(page)).toContain(title);
    const onSubmit = nodes(page, (props) => typeof props.onSubmit === "function")[0].onSubmit as (event: { preventDefault: () => void }) => Promise<void>;
    await onSubmit({ preventDefault: () => {} });
    const after = render();
    expect(text(after)).toContain(title);
    expect(text(after)).toContain("Category name already exists");
    expect(nodes(after, (props) => props.role === "alert")).toHaveLength(1);
  });

  it("warns that group deletion permanently loses per-item assignments and required settings", () => {
    setup("modifiers");
    const page = render();
    expect(text(page)).toMatch(/per-item assignments/i);
    expect(text(page)).toMatch(/required settings/i);
    expect(text(page)).toMatch(/permanently/i);
  });

  it("gives category and group confirmations specific names and descriptions", () => {
    setup("categories");
    const categoryPage = render();
    const categoryConfirm = nodes(categoryPage, (props) => props["aria-label"] === "Confirm delete category Mains")[0];
    expect(categoryConfirm.autoFocus).toBe(true);
    expect(categoryConfirm["aria-describedby"]).toBe("category-delete-warning-cat");
    expect(nodes(categoryPage, (props) => props.id === "category-delete-warning-cat")).toHaveLength(1);
    expect(nodes(categoryPage, (props) => props["aria-label"] === "Cancel delete category Mains")).toHaveLength(1);

    setup("modifiers");
    const modifierPage = render();
    const groupConfirm = nodes(modifierPage, (props) => props["aria-label"] === "Confirm delete option group Extras")[0];
    expect(groupConfirm.autoFocus).toBe(true);
    expect(groupConfirm["aria-describedby"]).toBe("group-delete-warning-group");
    expect(nodes(modifierPage, (props) => props.id === "group-delete-warning-group")).toHaveLength(1);
    expect(nodes(modifierPage, (props) => props["aria-label"] === "Cancel delete option group Extras")).toHaveLength(1);
  });

  it("gives option confirmations a specific name and description", () => {
    setup("modifiers");
    const page = renderExpanded();
    const optionConfirm = nodes(page, (props) => props["aria-label"] === "Confirm delete option Egg")[0];
    expect(optionConfirm.autoFocus).toBe(true);
    expect(optionConfirm["aria-describedby"]).toBe("modifier-delete-warning-option");
    expect(nodes(page, (props) => props.id === "modifier-delete-warning-option")).toHaveLength(1);
    expect(nodes(page, (props) => props["aria-label"] === "Cancel delete option Egg")).toHaveLength(1);
  });

  it.each([
    ["categories", "Delete Mains", "Cancel delete category Mains"],
    ["modifiers", "Delete Extras", "Cancel delete option group Extras"],
    ["modifiers", "Delete Egg", "Cancel delete option Egg"],
  ] as const)("restores focus to the %s delete trigger after cancel", (section, deleteLabel, cancelLabel) => {
    setup(section);
    const cancel = nodes(renderExpanded(), (props) => props["aria-label"] === cancelLabel)[0].onClick as () => void;
    cancel();
    const trigger = nodes(renderExpanded(), (props) => props["aria-label"] === deleteLabel)[0];
    expect(trigger.autoFocus).toBe(true);
  });

  function clientWithTableError(failingTable: string, message: string) {
    harness.client.mockReturnValue({ from: (table: string) => {
      const builder = {
        select() { return builder; }, order() { return builder; }, in() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => void) {
          resolve({
            data: table === "modifier_groups" ? [group] : [],
            error: table === failingTable ? { message } : null,
          });
        },
      };
      return builder;
    } });
  }

  function clientWithOptionDeleteRefresh() {
    harness.client.mockReturnValue({ from: (table: string) => {
      let operation = "read";
      let selection = "";
      const builder = {
        delete() { operation = "delete"; return builder; },
        select(value?: string) { selection = value ?? ""; return builder; }, order() { return builder; }, in() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => void) {
          if (operation === "delete") {
            resolve({ data: null, error: null });
            return;
          }
          if (selection === "archived_at") {
            resolve({ data: [{ archived_at: "2026-11-26T00:00:00Z" }], error: null });
            return;
          }
          if (table === "modifier_groups") {
            resolve({ data: [group], error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    } });
  }

  it("shows a group with a minimum selection as required and cannot toggle it optional", () => {
    setup("modifiers");
    harness.states[14] = [{ ...group, min_selections: 2 }];
    harness.states[20] = "item";
    harness.states[21] = { group: { bound: true, required: false } };
    const page = render();
    const requiredButton = nodes(page, (props) => props.children === "Required · min 2")[0];
    expect(requiredButton.disabled).toBe(true);
    expect(text(page)).not.toContain("Optional");
    (requiredButton.onClick as () => void)();
    expect(harness.states[21]).toEqual({ group: { bound: true, required: false } });
  });

  it("does not overwrite bindings when the binding read fails", async () => {
    setup("modifiers");
    harness.states[20] = "item";
    harness.states[21] = { group: { bound: true, required: true } };
    harness.client.mockReturnValue({ from: (table: string) => {
      const builder = {
        select() { return builder; }, order() { return builder; }, in() { return builder; }, eq() { return builder; },
        then(resolve: (value: unknown) => void) {
          resolve(table === "menu_item_modifier_groups"
            ? { data: null, error: { message: "permission denied" } }
            : { data: [], error: null });
        },
      };
      return builder;
    } });

    const page = render();
    const select = nodes(page, (props) => props["aria-label"] === "Select menu item")[0];
    await (select.onChange as (event: { target: { value: string } }) => Promise<void>)({ target: { value: "item" } });

    const after = render();
    expect(text(after)).toContain("Could not load this item's option assignments: permission denied");
    expect(nodes(after, (props) => props.role === "alert")).toHaveLength(1);
    expect(nodes(after, (props) => props.children === "Save Bindings")[0].disabled).toBe(true);
    expect(harness.states[21]).toEqual({});
  });

  it.each([
    ["categories", "Could not load the menu: categories failed"],
    ["modifier_groups", "Could not load the menu: groups failed"],
    ["modifiers", "Could not load the menu: options failed"],
  ] as const)("surfaces a %s load error instead of showing empty sections", async (failingTable, message) => {
    harness.states = [];
    clientWithTableError(failingTable, failingTable === "modifiers" ? "options failed" : failingTable === "modifier_groups" ? "groups failed" : `${failingTable} failed`);
    render();
    await runEffects();
    const after = render();
    expect(text(after)).toContain(message);
    expect(text(after)).not.toContain("No menu items yet");
  });

  it("resets the category filter when the filtered category is deleted", async () => {
    setup("categories");
    harness.states[6] = "cat";
    const page = render();
    const confirm = nodes(page, (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;
    await confirm();
    expect(harness.states[6]).toBe("all");
  });

  it("clears the selected item and its bindings when that item is deleted", async () => {
    setup("items");
    harness.states[20] = "item";
    harness.states[21] = { group: { bound: true, required: false } };
    const onDelete = nodes(render(), (props) => (props.item as { id?: string } | undefined)?.id === "item")[0].onDelete as () => Promise<void>;
    await onDelete();
    expect(harness.states[20]).toBe("");
    expect(harness.states[21]).toEqual({});
  });

  it("clears the selected item and its bindings when its category is deleted", async () => {
    setup("categories");
    harness.states[20] = "item";
    harness.states[21] = { group: { bound: true, required: false } };
    const confirm = nodes(render(), (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;
    await confirm();
    expect(harness.states[20]).toBe("");
    expect(harness.states[21]).toEqual({});
  });

  it("warns that deleting the last available option removes required assignments", () => {
    setup("modifiers");
    harness.states[14] = [{ ...group, modifiers: [{ id: "option", name: "Egg", is_available: true }] }];
    const page = renderExpanded();
    expect(text(page)).toMatch(/last available option/i);
    expect(text(page)).toMatch(/assignments.*removed/i);
  });

  it("warns that unchecking the last available option removes required assignments", () => {
    setup("modifiers");
    harness.states[14] = [{ ...group, modifiers: [{ id: "option", name: "Egg", is_available: true }] }];
    harness.states[17] = {
      groupId: "group",
      modifier: {
        id: "option", name: "Egg", price: "1.00", grabPrice: "", originalGrabPrice: null,
        grabRowExists: false, is_default: false, is_available: true,
      },
    };
    const page = render();
    expect(text(page)).toContain("Unchecking Available removes required item assignments");
  });

  it("reloads the selected item's bindings after deleting the last available option", async () => {
    setup("modifiers");
    harness.states[19] = "option";
    harness.states[20] = "item";
    harness.states[21] = { group: { bound: true, required: true } };
    clientWithOptionDeleteRefresh();
    const onDelete = nodes(render(), (props) => (props.modifier as { id?: string } | undefined)?.id === "option")[0].onDelete as () => Promise<void>;
    await onDelete();
    expect(harness.states[21]).toEqual({ group: { bound: false, required: false } });
  });

  it.each(["category", "item", "group", "option"] as const)("reports an unconfirmed %s delete as a failure", async (kind) => {
    const section = kind === "category" ? "categories" : kind === "item" ? "items" : "modifiers";
    const requests = setup(section);
    harness.states[20] = "item";
    harness.states[21] = { group: { bound: true, required: true } };
    clientWithUnconfirmedDelete();
    const page = render();
    let remove: () => Promise<void>;
    if (kind === "item") remove = nodes(page, (props) => (props.item as { id?: string } | undefined)?.id === "item")[0].onDelete as () => Promise<void>;
    else if (kind === "option") remove = nodes(page, (props) => (props.modifier as { id?: string } | undefined)?.id === "option")[0].onDelete as () => Promise<void>;
    else remove = nodes(page, (props) => props.children === "Confirm" && typeof props.onClick === "function")[0].onClick as () => Promise<void>;

    await remove();

    const after = render();
    expect(text(after)).toMatch(/did not confirm/i);
    expect(harness.invalidate).not.toHaveBeenCalled();
    expect(harness.notify).not.toHaveBeenCalled();
    if (kind === "group") expect(harness.states[21]).toEqual({ group: { bound: true, required: true } });
    if (kind === "category") expect(harness.states[9]).toEqual(category);
    if (kind === "item") expect(harness.states[12]).toEqual({ id: item.id, name: item.name });
    if (kind === "option") expect(harness.states[19]).toBe("option");
    expect(requests.length).toBeLessThanOrEqual(1);
  });

  it("restores focus to the item delete control after cancel", () => {
    setup("items");
    const row = nodes(render(), (props) => (props.item as { id?: string } | undefined)?.id === "item")[0];
    (row.onDeleteCancel as () => void)();
    const after = nodes(render(), (props) => (props.item as { id?: string } | undefined)?.id === "item")[0];
    expect(after.autoFocusDelete).toBe(true);
  });
});
