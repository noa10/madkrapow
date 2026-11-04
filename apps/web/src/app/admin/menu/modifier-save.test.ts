import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  client: vi.fn(),
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
}));
vi.mock("@/hooks/use-role-guard", () => ({ useRoleGuard: () => ({ hasAccess: true, isLoading: false }) }));
vi.mock("@/stores/toast", () => ({ useToastStore: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getBrowserClient: harness.client }));
vi.mock("@/lib/admin/menu-cache", () => ({ notifyMenuChanged: harness.invalidate }));
vi.mock("@/lib/grabfood/notify-client", () => ({ notifyGrabMenuAfterChange: harness.notify }));

const { default: AdminMenuPage } = await import("./page");

type Node = { props?: { children?: unknown; onClick?: () => Promise<void> } };
function findSave(node: unknown): (() => Promise<void>) | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSave(child);
      if (found) return found;
    }
    return;
  }
  if (!node || typeof node !== "object") return;
  const props = (node as Node).props;
  if (props?.children === "Save" && props.onClick) return props.onClick;
  return findSave(props?.children);
}

function findNodes(node: unknown, predicate: (props: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findNodes(child, predicate));
  if (!node || typeof node !== "object") return [];
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return [];
  return [...(predicate(props) ? [props] : []), ...findNodes(props.children, predicate)];
}

function setup(options: { price?: string; original?: number | null; created?: boolean; priceFails?: boolean; timeout?: boolean; concurrentPrice?: number; readFails?: string; pausePrice?: Promise<void> } = {}) {
  const events: string[] = [];
  const group = { id: "group", name: "Extras", min_selections: 0, max_selections: 1, modifiers: [] };
  const local = { id: "option", modifier_group_id: "group", name: "Edited", price_delta_cents: 100 };
  let serverPrice = options.concurrentPrice ?? options.original ?? null;
  let timeout = options.timeout;
  const query = (table: string) => {
    let operation = "read";
    const builder = {
      select() { return builder; }, order() { return builder; }, limit() { return builder; },
      in() { return builder; }, eq() { return builder; },
      update() { operation = "write"; return builder; },
      insert() { operation = "write"; return builder; },
      async single() {
        if (operation === "write") { events.push("local"); return { data: { id: "option" }, error: null }; }
        return { data: null, error: null };
      },
      then(resolve: (value: unknown) => void) {
        if (operation === "write") events.push("local");
        else events.push(`read:${table}`);
        resolve({ data: table === "modifier_groups" ? [group] : table === "modifiers" && operation === "read" ? [local] : null, error: operation === "read" && table === options.readFails ? { message: "read failed" } : null });
      },
    };
    return builder;
  };
  harness.client.mockReturnValue({ from: query, auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } });
  harness.invalidate.mockImplementation(() => events.push("invalidate"));
  harness.notify.mockImplementation(async () => { events.push("notify"); return null; });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    events.push("price");
    if (options.pausePrice) await options.pausePrice;
    if (options.priceFails) return Response.json({ error: "price conflict" }, { status: 409 });
    serverPrice = JSON.parse(init.body as string).price_cents;
    if (timeout) { timeout = false; throw new Error("connection lost"); }
    return Response.json({ ok: true });
  }));
  harness.states = [];
  harness.states[2] = "modifiers";
  harness.states[3] = false;
  harness.states[14] = [group];
  harness.states[15] = new Set(["group"]);
  harness.states[17] = { groupId: "group", modifier: { id: options.created ? undefined : "option", name: "Edited", price: "1", grabPrice: options.price ?? "2.00", originalGrabPrice: options.original ?? null, grabRowExists: options.original != null, is_default: false, is_available: true } };
  const save = () => { harness.index = 0; const handler = findSave(AdminMenuPage()); if (!handler) throw new Error("Save button missing"); return handler(); };
  return { events, save, getServerPrice: () => serverPrice };
}

beforeEach(() => { vi.restoreAllMocks(); harness.client.mockReset(); harness.invalidate.mockReset(); harness.notify.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("modifier saves", () => {
  it("invalidates immediately after saving locally, then saves the changed Grab price and notifies", async () => {
    const { events, save, getServerPrice } = setup({ original: 100 });
    await save();
    expect(events).toEqual(["local", "invalidate", "price", "notify", "read:modifier_groups", "read:modifiers"]);
    expect(getServerPrice()).toBe(200);
    expect(harness.states[17]).toBeNull();
  });

  it("refreshes the list and notifies Grab after a price failure while retaining a new option for retry", async () => {
    const { events, save } = setup({ created: true, priceFails: true });
    await save();
    expect(events).toEqual(["local", "invalidate", "price", "notify", "read:modifier_groups", "read:modifiers"]);
    expect(harness.states[17]).toMatchObject({ error: expect.stringContaining("price conflict"), modifier: { id: "option", grabPrice: "2.00", originalGrabPrice: null } });
    expect(harness.states[14]).toMatchObject([{ modifiers: [{ id: "option", name: "Edited" }] }]);
  });

  it.each([{ original: 100, price: "1.00" }, { original: null, price: "", created: true }])("does not overwrite or conflict with a concurrent Grab price when unchanged: %o", async (options) => {
    const { events, save, getServerPrice } = setup({ ...options, concurrentPrice: 300 });
    await save();
    expect(events).toEqual(["local", "invalidate", "notify", "read:modifier_groups", "read:modifiers"]);
    expect(getServerPrice()).toBe(300);
    expect(harness.states[17]).toBeNull();
  });

  it("retries the same unconfirmed price without creating another option", async () => {
    const { events, save, getServerPrice } = setup({ created: true, timeout: true });
    await save();
    expect(getServerPrice()).toBe(200);
    events.length = 0;
    await save();
    expect(events).toEqual(["local", "invalidate", "price", "notify", "read:modifier_groups", "read:modifiers"]);
    expect(harness.states[17]).toBeNull();
  });

  it.each(["modifier_groups", "modifiers"])("keeps the old list and editor when refreshing %s fails", async (readFails) => {
    const { save } = setup({ original: 100, readFails });
    const previousList = harness.states[14];
    await save();
    expect(harness.states[14]).toBe(previousList);
    expect(harness.states[17]).toMatchObject({ error: expect.stringMatching(/refresh|reload/i) });
  });

  it("disables editor inputs and switching controls while a price request is pending", async () => {
    let release!: () => void;
    const pausePrice = new Promise<void>((resolve) => { release = resolve; });
    const { save } = setup({ original: 100, pausePrice });
    const group = { id: "other", name: "Other", min_selections: 0, max_selections: 1, modifiers: [{ id: "another", name: "Another" }] };
    harness.states[14] = [...harness.states[14] as unknown[], group];
    harness.states[15] = new Set(["group", "other"]);
    const pending = save();
    await vi.waitFor(() => expect(harness.states[11]).toBe(true));
    harness.index = 0;
    const page = AdminMenuPage();
    const inputs = findNodes(page, (props) => ["Option name", "Option price (RM)", "GrabFood price (RM)"].includes(props["aria-label"] as string));
    expect(inputs).toHaveLength(3);
    expect(inputs.every((props) => props.disabled === true)).toBe(true);
    const checkboxes = findNodes(page, (props) => props.type === "checkbox" && typeof props.checked === "boolean");
    expect(checkboxes.every((props) => props.disabled === true)).toBe(true);
    const add = findNodes(page, (props) => Array.isArray(props.children) && props.children.includes("Add option"));
    expect(add).toHaveLength(1);
    expect(add[0].disabled).toBe(true);
    const rows = findNodes(page, (props) => (props.modifier as { id?: string } | undefined)?.id === "another");
    expect(rows).toHaveLength(1);
    expect(rows[0].isSaving).toBe(true);
    const navigation = findNodes(page, (props) => ["Items", "Categories", "Options"].includes(props.children as string) && "aria-current" in props);
    expect(navigation).toHaveLength(3);
    expect(navigation.every((props) => props.disabled === true)).toBe(true);
    release();
    await pending;
  });

  it("requires a fresh review when an unconfirmed price is reverted to its original value", async () => {
    const { events, save, getServerPrice } = setup({ original: 100, timeout: true });
    await save();
    expect(getServerPrice()).toBe(200);
    const editing = harness.states[17] as { modifier: Record<string, unknown> };
    harness.states[17] = { ...editing, modifier: { ...editing.modifier, grabPrice: "1.00" } };
    events.length = 0;
    await save();
    expect(events).toEqual([]);
    expect(harness.states[17]).toMatchObject({ error: expect.stringMatching(/review|reload/i) });
    expect(getServerPrice()).toBe(200);
  });
});
