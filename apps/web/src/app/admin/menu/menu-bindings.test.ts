import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  client: vi.fn(),
  rpc: vi.fn(),
  invalidate: vi.fn(),
  notify: vi.fn(),
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
  useEffect: () => {},
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => ({ current: initial }),
}));
vi.mock("@/hooks/use-role-guard", () => ({ useRoleGuard: () => ({ hasAccess: true, isLoading: false }) }));
vi.mock("@/stores/toast", () => ({ useToastStore: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient: harness.client }));
vi.mock("@/lib/admin/menu-cache", () => ({ notifyMenuChanged: harness.invalidate }));
vi.mock("@/lib/grabfood/notify-client", () => ({ notifyGrabMenuAfterChange: harness.notify }));

const { default: AdminMenuPage } = await import("./page");

type Node = { props?: { children?: unknown; onClick?: () => Promise<void> } };

function findButton(node: unknown, label: string): (() => Promise<void>) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findButton(child, label);
      if (found) return found;
    }
    return;
  }
  if (!node || typeof node !== "object") return;
  const props = (node as Node).props;
  if (props?.children === label && props.onClick) return props.onClick;
  return findButton(props?.children, label);
}

const GROUPS = [
  { id: "keep", name: "Keep", min_selections: 0, max_selections: 1, modifiers: [] },
  { id: "removed", name: "Removed", min_selections: 0, max_selections: 1, modifiers: [] },
];

function setup() {
  const events: string[] = [];
  const query = (table: string) => {
    let operation = "read";
    let selection = "";
    const builder = {
      select(value?: string) { selection = value ?? ""; return builder; }, order() { return builder; }, limit() { return builder; },
      in() { return builder; }, eq() { return builder; },
      update() { operation = "write"; return builder; },
      insert() { operation = "write"; return builder; },
      delete() { operation = "delete"; return builder; },
      async single() { return { data: null, error: null }; },
      then(resolve: (value: unknown) => void) {
        if (operation === "delete") events.push(`delete:${table}`);
        else events.push(`read:${table}`);
        const data = selection === "archived_at"
          ? [{ archived_at: "2026-11-26T00:00:00Z" }]
          : table === "modifier_groups" ? GROUPS : null;
        resolve({ data, error: null });
      },
    };
    return builder;
  };
  harness.client.mockReturnValue({ from: query, rpc: harness.rpc });
  harness.rpc.mockImplementation(async (name: string) => { events.push(`rpc:${name}`); return { data: [], error: null }; });
  harness.invalidate.mockImplementation(() => events.push("invalidate"));
  harness.notify.mockImplementation(async () => { events.push("notify"); return null; });
  harness.states = [];
  harness.states[2] = "modifiers";
  harness.states[3] = false;
  harness.states[14] = GROUPS;
  harness.states[15] = new Set(["keep", "removed"]);
  harness.states[20] = "item-1";
  harness.states[21] = { keep: { bound: true, required: false }, removed: { bound: true, required: true } };
  const click = (label: string) => {
    harness.index = 0;
    const handler = findButton(AdminMenuPage(), label);
    if (!handler) throw new Error(`${label} button missing`);
    return handler();
  };
  return { events, click };
}

beforeEach(() => {
  vi.restoreAllMocks();
  harness.client.mockReset();
  harness.rpc.mockReset();
  harness.invalidate.mockReset();
  harness.notify.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("modifier bindings", () => {
  it("replaces every binding for the item in one transactional call", async () => {
    const { events, click } = setup();
    await click("Save Bindings");
    expect(harness.rpc).toHaveBeenCalledTimes(1);
    expect(harness.rpc).toHaveBeenCalledWith("replace_item_modifier_groups", {
      p_menu_item_id: "item-1",
      p_bindings: [
        { modifier_group_id: "keep", is_required: false },
        { modifier_group_id: "removed", is_required: true },
      ],
    });
    expect(events).toEqual(["rpc:replace_item_modifier_groups", "invalidate", "notify"]);
    expect(harness.states[24]).toBe(true);
  });

  it("drops a deleted group from the pending selection so it is never re-bound", async () => {
    const { events, click } = setup();
    harness.states[18] = "removed";
    await click("Confirm");
    expect(events[0]).toBe("delete:modifier_groups");
    expect(harness.states[21]).toEqual({ keep: { bound: true, required: false } });
    events.length = 0;
    await click("Save Bindings");
    expect(harness.rpc).toHaveBeenCalledWith("replace_item_modifier_groups", {
      p_menu_item_id: "item-1",
      p_bindings: [{ modifier_group_id: "keep", is_required: false }],
    });
  });

  it("keeps the previous selection and reports the error when the replacement fails", async () => {
    const { click } = setup();
    harness.rpc.mockResolvedValueOnce({ data: null, error: { message: "required modifier group has no available options" } });
    await click("Save Bindings");
    expect(harness.states[21]).toEqual({ keep: { bound: true, required: false }, removed: { bound: true, required: true } });
    expect(harness.states[4]).toBe("required modifier group has no available options");
    expect(harness.invalidate).not.toHaveBeenCalled();
  });
});
