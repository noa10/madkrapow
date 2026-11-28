import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  index: 0,
  effects: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const changed = (a: unknown[] | undefined, b: unknown[]) =>
    !a || a.length !== b.length || b.some((value, index) => !Object.is(value, a[index]));
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.values[index] as { deps: unknown[]; value: unknown } | undefined;
    if (!previous || changed(previous.deps, deps)) hooks.values[index] = { deps, value: factory() };
    return (hooks.values[index] as { value: unknown }).value;
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.index++;
      if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [
        hooks.values[index],
        (value: unknown) => {
          hooks.values[index] = typeof value === "function"
            ? (value as (previous: unknown) => unknown)(hooks.values[index])
            : value;
        },
      ];
    },
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useMemo: memo,
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const index = hooks.index++;
      const previous = hooks.values[index] as { deps: unknown[]; cleanup?: () => void } | undefined;
      if (!previous || changed(previous.deps, deps)) {
        hooks.effects.push(() => {
          previous?.cleanup?.();
          hooks.values[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
});

const requests = vi.hoisted(() => ({
  calls: [] as Array<{
    url: string;
    signal?: AbortSignal;
    resolve: (value: unknown) => void;
  }>,
}));

vi.mock("@/hooks/use-role-guard", () => ({ useRoleGuard: () => ({ hasAccess: true, isLoading: false }) }));

import AnalyticsPage from "./page";

const emptyTrends: never[] = [];

function payload(overrides: Record<string, unknown> = {}) {
  return {
    range: { from: "2026-10-29", to: "2026-11-27" },
    pulse: {
      order_count: 1,
      revenue_cents: 1000,
      avg_order_cents: 1000,
      delivery_count: 1,
      pickup_count: 0,
      dine_in_count: 0,
    },
    totals: { order_count: 2, revenue_cents: 5000 },
    trends: emptyTrends,
    top_items: [
      { menu_item_name: "Beef Krapow", menu_item_id: "item-1", total_quantity: 4, total_revenue_cents: 4000 },
    ],
    items_sold: 7,
    sources: [{ source: "web", order_count: 2 }],
    ...overrides,
  };
}

function render() {
  hooks.index = 0;
  const result = AnalyticsPage();
  const effects = hooks.effects.splice(0);
  effects.forEach((effect) => effect());
  return result;
}

function find(node: ReactNode, predicate: (element: ReactElement<{ children?: ReactNode }>) => boolean): ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    if (predicate(element)) return element;
    return find(element.props.children, predicate);
  }
  return undefined;
}

function control(tree: ReactNode, type: string, position = 0) {
  let seen = 0;
  const element = find(tree, (candidate) => candidate.type === type && seen++ === position);
  if (!element) throw new Error(`Missing ${type} ${position}`);
  return element;
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node && typeof node === "object" && "props" in node) return text((node as ReactElement<{ children?: ReactNode }>).props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

async function respond(index: number, body: unknown = payload()) {
  requests.calls[index].resolve({ ok: true, status: 200, json: async () => body });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  hooks.values = [];
  hooks.index = 0;
  hooks.effects = [];
  requests.calls = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: { signal?: AbortSignal }) =>
    new Promise((resolve, reject) => {
      requests.calls.push({ url, signal: init?.signal, resolve });
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("The operation was aborted.");
        error.name = "AbortError";
        reject(error);
      });
    })
  ));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("analytics page data source", () => {
  it("loads the shared analytics API instead of querying tables from the browser", async () => {
    render();
    expect(requests.calls).toHaveLength(1);
    expect(requests.calls[0].url).toBe("/api/admin/analytics?range=30d");
    await respond(0);
    const tree = text(render()).replace(/\s+/g, " ");
    expect(tree).toContain("RM 50.00");
    expect(tree).toContain("RM 25.00");
    expect(tree).toContain("Beef Krapow");
    expect(tree).toContain("4 sold");
  });

  it("shows items sold from the API total rather than summing the top ten items", async () => {
    render();
    await respond(0, payload({ items_sold: 1234 }));
    expect(text(render())).toContain("1234");
  });

  it("does not invent a returning-customer split", async () => {
    render();
    await respond(0);
    const tree = text(render());
    expect(tree).not.toContain("Returning");
    expect(tree).not.toContain("New Customers");
  });

  it("keeps the newest range when an earlier request resolves last", async () => {
    render();
    await respond(0);
    let tree = render();
    control(tree, "button", 0).props.onClick();
    render();
    tree = render();
    const ninetyDays = find(tree, (element) => element.type === "button" && text(element.props.children) === "90 days");
    ninetyDays!.props.onClick();
    render();

    expect(requests.calls).toHaveLength(3);
    expect(requests.calls[2].url).toBe("/api/admin/analytics?range=90d");
    expect(requests.calls[1].signal?.aborted).toBe(true);

    await respond(2, payload({ totals: { order_count: 3, revenue_cents: 9000 } }));
    await respond(1, payload({ totals: { order_count: 1, revenue_cents: 100 } }));
    expect(text(render())).toContain("RM 90.00");
    expect(text(render())).not.toContain("RM 1.00");
  });

  it("waits for a valid custom range and sends both dates", async () => {
    render();
    await respond(0);
    let tree = render();
    const custom = find(tree, (element) => element.type === "button" && text(element.props.children) === "Custom");
    custom!.props.onClick();
    render();
    expect(requests.calls).toHaveLength(1);

    tree = render();
    control(tree, "input", 0).props.onChange({ target: { value: "2026-11-20" } });
    render();
    expect(requests.calls).toHaveLength(1);

    tree = render();
    control(tree, "input", 1).props.onChange({ target: { value: "2026-11-19" } });
    tree = render();
    expect(requests.calls).toHaveLength(1);
    expect(text(tree)).toContain("The start date must be on or before the end date.");

    control(tree, "input", 1).props.onChange({ target: { value: "2026-11-22" } });
    render();
    expect(requests.calls).toHaveLength(2);
    expect(requests.calls[1].url).toBe("/api/admin/analytics?from=2026-11-20&to=2026-11-22");
  });

  it("offers a retry when the request fails", async () => {
    render();
    requests.calls[0].resolve({ ok: false, status: 500, json: async () => ({}) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    let tree = render();
    expect(text(tree)).toContain("Unable to load analytics");

    const retry = find(tree, (element) => element.type === "button" && text(element.props.children) === "Try again");
    retry!.props.onClick();
    render();
    expect(requests.calls).toHaveLength(2);
  });

  it("shows fresh data when the user returns to a range that failed earlier", async () => {
    render();
    requests.calls[0].resolve({ ok: false, status: 500, json: async () => ({}) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(text(render())).toContain("Unable to load analytics");

    const rangeButton = (label: string) =>
      find(render(), (element) => element.type === "button" && text(element.props.children) === label)!;

    rangeButton("7 days").props.onClick();
    render();
    await respond(1, payload({ totals: { order_count: 2, revenue_cents: 5000 } }));
    expect(text(render())).toContain("RM 50.00");

    rangeButton("30 days").props.onClick();
    render();
    await respond(2, payload({ totals: { order_count: 4, revenue_cents: 4000 } }));

    const tree = text(render());
    expect(tree).not.toContain("Unable to load analytics");
    expect(tree).toContain("RM 40.00");
  });

  it("times out a stalled request instead of loading forever", async () => {
    vi.useFakeTimers();
    try {
      render();
      expect(requests.calls).toHaveLength(1);
      const signal = requests.calls[0].signal!;
      expect(signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(20_000);
      expect(signal.aborted).toBe(true);

      const tree = text(render());
      expect(tree).toContain("took too long");
      expect(tree).toContain("Try again");
    } finally {
      vi.useRealTimers();
    }
  });
});
