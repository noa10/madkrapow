import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, effects: [] as Array<() => void> }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: () => ({ current: null }),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => void) => { hooks.effects.push(effect); },
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
}));

vi.mock("@/hooks/use-role-guard", () => ({ useRoleGuard: () => ({ hasAccess: true, isLoading: false }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { RevenueCharts } from "./RevenueCharts";
import AnalyticsPage from "../../../app/admin/analytics/page";

const salesData = [
  { date: "2026-11-01", label: "1 Nov", revenueCents: 1000, orders: 1 },
  { date: "2026-11-02", label: "2 Nov", revenueCents: null, orders: null },
  { date: "2026-11-03", label: "3 Nov", revenueCents: 2500, orders: 2 },
];

function render(data = salesData) {
  hooks.index = 0;
  return RevenueCharts({ salesData: data });
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join(" ");
  if (node && typeof node === "object" && "props" in node) return text((node as ReactElement<{ children?: ReactNode }>).props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function find(node: ReactNode, predicate: (element: ReactElement<any>) => boolean): ReactElement<any> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) { const match = find(child, predicate); if (match) return match; }
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as ReactElement<any>;
    if (predicate(element)) return element;
    return find(element.props.children, predicate);
  }
  return undefined;
}
function button(tree: ReactNode, label: string) {
  const found = find(tree, (element) => element.type === "button" && text(element.props.children).trim() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

beforeEach(() => { hooks.values = []; hooks.index = 0; hooks.effects = []; });

describe("sales insights", () => {
  it("maps absent trend rows to zero after a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      range: { from: "2026-11-01", to: "2026-11-03" },
      trends: [{ order_date: "2026-11-02", revenue_cents: 2500, order_count: 2 }],
      totals: { order_count: 2, revenue_cents: 2500 },
      pulse: { order_count: 0, revenue_cents: 0, avg_order_cents: 0, delivery_count: 0, pickup_count: 0, dine_in_count: 0 },
      top_items: [], items_sold: 0, sources: [],
    }) });
    vi.stubGlobal("fetch", fetchMock);
    try {
      hooks.index = 0;
      AnalyticsPage();
      hooks.effects.splice(0).forEach((effect) => effect());
      await new Promise((resolve) => setTimeout(resolve, 0));
      hooks.index = 0;
      const tree = AnalyticsPage();
      const chart = find(tree, (element) => Array.isArray(element.props.salesData));
      expect(chart?.props.salesData).toEqual([
        { date: "2026-11-01", label: "1 Nov", revenueCents: 0, orders: 0 },
        { date: "2026-11-02", label: "2 Nov", revenueCents: 2500, orders: 2 },
        { date: "2026-11-03", label: "3 Nov", revenueCents: 0, orders: 0 },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows regularly spaced dates throughout a scrollable chart", () => {
    const data = Array.from({ length: 10 }, (_, index) => ({
      date: `2026-11-${String(index + 1).padStart(2, "0")}`,
      label: `${index + 1} Nov`, revenueCents: 100, orders: 1,
    }));
    const tree = render(data);
    const labels = find(tree, (element) => element.type === "div" && element.props["aria-hidden"] === true && text(element).includes("1 Nov"));
    expect(text(labels)).toContain("4 Nov");
    expect(text(labels)).toContain("7 Nov");
    expect(text(labels)).toContain("10 Nov");
  });

  it("scrolls the initially selected bar into the chart viewport", () => {
    const tree = render();
    const scroller = find(tree, (element) => element.type === "div" && element.props.className?.includes("overflow-x-auto"));
    const selectedBar = { getBoundingClientRect: () => ({ left: 180, right: 208 }) };
    const container = { scrollLeft: 0, getBoundingClientRect: () => ({ left: 0, right: 100 }), querySelector: vi.fn(() => selectedBar) };
    scroller!.props.ref.current = container;
    hooks.effects.at(-1)!();
    expect(container.querySelector).toHaveBeenCalledWith('button[aria-pressed="true"]');
    expect(container.scrollLeft).toBe(108);
  });
  it("shows the selected metric's scale without selecting a bar", () => {
    let tree = render();
    expect(text(tree)).toContain("RM 25.00");
    const scale = find(tree, (element) => element.props["aria-label"] === "Chart scale");
    expect(text(scale)).toContain("RM 25.00");
    expect(text(scale)).toContain("RM 0.00");
    button(tree, "Orders").props.onClick();
    tree = render();
    expect(text(find(tree, (element) => element.props["aria-label"] === "Chart scale"))).toContain("2");
  });

  it("shows the selected daily interval and allows selecting a different day", () => {
    let tree = render();
    expect(text(tree)).toContain("RM 25.00");
    expect(text(tree)).toContain("2026-11-03");
    const first = find(tree, (element) => element.type === "button" && element.props["aria-label"]?.includes("2026-11-01"));
    expect(first).toBeDefined();
    first!.props.onClick();
    tree = render();
    expect(text(tree)).toContain("RM 10.00");
    expect(find(tree, (element) => element.type === "button" && element.props["aria-label"]?.includes("2026-11-01"))?.props["aria-pressed"]).toBe(true);
  });

  it("groups only days in the chosen range and labels partial weeks", () => {
    let tree = render();
    button(tree, "Weekly").props.onClick();
    tree = render();
    expect(text(tree)).toContain("2026-11-02 to 2026-11-03");
    expect(text(tree)).toContain("Reported days only · incomplete data");
    expect(text(tree)).toContain("RM 25.00");
    button(tree, "Monthly").props.onClick();
    tree = render();
    expect(text(tree)).toContain("2026-11-01 to 2026-11-03");
    expect(text(tree)).toContain("RM 35.00");
    expect(text(tree)).not.toContain("Hourly");
  });

  it("shows missing days as unavailable rather than zero", () => {
    let tree = render();
    const missing = find(tree, (element) => element.type === "button" && element.props["aria-label"]?.includes("2026-11-02"));
    expect(missing?.props["aria-label"]).toContain("No data");
    missing!.props.onClick();
    tree = render();
    expect(text(tree)).toContain("No data for this interval");
    const summary = find(tree, (element) => element.type === "div" && element.props.className === "min-w-0 flex-1");
    expect(text(summary)).toContain("—");
    expect(text(summary)).not.toContain("RM 0.00");
  });

  it("changes the chart metric without changing the interval summary", () => {
    let tree = render();
    button(tree, "Orders").props.onClick();
    tree = render();
    expect(text(tree).replace(/\s+/g, " ")).toContain("Orders by daily interval");
    expect(text(tree)).toContain("RM 25.00");
    expect(button(tree, "Orders").props["aria-pressed"]).toBe(true);
  });

  it("scales bars using the selected metric", () => {
    let tree = render();
    const barHeight = (date: string) => {
      const day = find(tree, (element) => element.type === "button" && element.props["aria-label"]?.includes(date));
      return find(day, (element) => element.type === "span" && element.props.style)?.props.style.height;
    };
    expect(barHeight("2026-11-01")).toBe("40%");
    expect(barHeight("2026-11-03")).toBe("100%");
    button(tree, "Orders").props.onClick();
    tree = render();
    expect(barHeight("2026-11-01")).toBe("50%");
    expect(barHeight("2026-11-03")).toBe("100%");
  });

  it("does not draw a positive bar for a reported zero", () => {
    const tree = render([
      { date: "2026-11-01", label: "1 Nov", revenueCents: 0, orders: 0 },
      { date: "2026-11-02", label: "2 Nov", revenueCents: 1000, orders: 1 },
    ]);
    const day = find(tree, (element) => element.type === "button" && element.props["aria-label"]?.includes("2026-11-01"));
    expect(find(day, (element) => element.type === "span" && element.props.style)?.props.style.height).toBe("0%");
  });

  it("keeps all-zero metrics at the baseline", () => {
    const data = [{ date: "2026-11-01", label: "1 Nov", revenueCents: 0, orders: 0 }];
    let tree = render(data);
    button(tree, "Orders").props.onClick();
    tree = render(data);
    const day = find(tree, (element) => element.type === "button" && element.props["aria-label"]?.includes("2026-11-01"));
    expect(day?.props["aria-label"]).toContain("0 orders");
    expect(find(day, (element) => element.type === "span" && element.props.style)?.props.style.height).toBe("0%");
  });

  it("can collapse and restore the insight chart", () => {
    let tree = render();
    button(tree, "See less insight").props.onClick();
    tree = render();
    expect(button(tree, "See more insight").props["aria-expanded"]).toBe(false);
    button(tree, "See more insight").props.onClick();
    expect(button(render(), "See less insight").props["aria-expanded"]).toBe(true);
  });
});
