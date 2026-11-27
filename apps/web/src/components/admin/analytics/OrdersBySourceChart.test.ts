import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrdersBySourceChart } from "@/components/admin/analytics/OrdersBySourceChart";

const render = (sourceData: Array<{ name: string; value: number }>) =>
  renderToStaticMarkup(createElement(OrdersBySourceChart, { sourceData }));

describe("OrdersBySourceChart", () => {
  it("writes the count and share next to every source", () => {
    const html = render([
      { name: "Web", value: 3 },
      { name: "GrabFood", value: 1 },
    ]);

    expect(html).toContain("Web");
    expect(html).toContain("3 · 75%");
    expect(html).toContain("GrabFood");
    expect(html).toContain("1 · 25%");
  });

  it("keeps every channel visible when there are more than four", () => {
    const html = render([
      { name: "Web", value: 5 },
      { name: "GrabFood", value: 4 },
      { name: "foodpanda", value: 3 },
      { name: "Counter", value: 2 },
      { name: "Table QR", value: 1 },
    ]);

    for (const name of ["Web", "GrabFood", "foodpanda", "Counter", "Table QR"]) {
      expect(html).toContain(name);
    }
  });

  it("describes each bar for assistive technology", () => {
    const html = render([{ name: "GrabFood", value: 2 }]);

    expect(html).toContain('role="img"');
    expect(html).toContain("GrabFood: 2 orders, 100% of the range");
  });

  it("shows an empty state instead of an empty chart", () => {
    const html = render([]);

    expect(html).toContain("No orders in this range.");
    expect(html).not.toContain('role="img"');
  });
});
