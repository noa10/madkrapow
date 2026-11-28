"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface SalesChartPoint {
  label: string;
  date: string;
  revenueCents: number | null;
  orders: number | null;
}

type Period = "Daily" | "Weekly" | "Monthly";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatRinggit(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`;
}

function periodKey(date: string, period: Period) {
  if (period === "Daily") return date;
  if (period === "Monthly") return date.slice(0, 7);
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

export function RevenueCharts({ salesData }: { salesData: SalesChartPoint[] }) {
  const [period, setPeriod] = useState<Period>("Daily");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [metric, setMetric] = useState<"Revenue" | "Orders">("Revenue");
  const chartRef = useRef<HTMLDivElement>(null);
  const intervals = salesData.reduce<Array<{ key: string; from: string; to: string; label: string; revenue: number; orders: number; revenueCount: number; ordersCount: number; incomplete: boolean }>>((groups, point) => {
    const key = periodKey(point.date, period);
    const previous = groups[groups.length - 1];
    const current = previous?.key === key ? previous : null;
    const next = {
      key,
      from: current?.from ?? point.date,
      to: point.date,
      label: current?.label ?? point.label,
      revenue: (current?.revenue ?? 0) + (point.revenueCents ?? 0),
      orders: (current?.orders ?? 0) + (point.orders ?? 0),
      revenueCount: (current?.revenueCount ?? 0) + (point.revenueCents === null ? 0 : 1),
      ordersCount: (current?.ordersCount ?? 0) + (point.orders === null ? 0 : 1),
      incomplete: (current?.incomplete ?? false) || point.revenueCents === null || point.orders === null,
    };
    return current ? [...groups.slice(0, -1), next] : [...groups, next];
  }, []);
  const selected = intervals.find((item) => selectedDate !== null && selectedDate >= item.from && selectedDate <= item.to) ?? intervals[intervals.length - 1];
  useEffect(() => {
    const container = chartRef.current;
    const bar = container?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (!container || !bar || !expanded) return;
    const viewport = container.getBoundingClientRect();
    const bounds = bar.getBoundingClientRect();
    if (bounds.right > viewport.right) container.scrollLeft += bounds.right - viewport.right;
    else if (bounds.left < viewport.left) container.scrollLeft -= viewport.left - bounds.left;
  }, [selected?.key, period, expanded]);
  const maximum = Math.max(0, ...intervals.map((item) => metric === "Revenue" ? item.revenue : item.orders));
  // Monthly bars are few (at most 13 in a year), so every month gets a tick and
  // reads as a month rather than as its first day. Daily and weekly bars are
  // dense, so they keep every third tick.
  const labelEvery = period === "Monthly" ? 1 : 3;
  const multiYear = new Set(intervals.map((item) => item.key.slice(0, 4))).size > 1;
  const tickLabel = (item: { key: string; label: string }) => {
    if (period !== "Monthly") return item.label;
    const [year, month] = item.key.split("-").map(Number);
    return multiYear ? `${MONTHS[month - 1]} '${String(year).slice(2)}` : MONTHS[month - 1];
  };
  const intervalLabel = (item: { from: string; to: string }) => item.from === item.to ? item.from : `${item.from} to ${item.to}`;
  const describeInterval = (item: typeof intervals[number]) => `${intervalLabel(item)}: ${item.revenueCount ? formatRinggit(item.revenue) : "No data"}, ${item.ordersCount ? `${item.orders} orders` : "No data"}${item.incomplete && (item.revenueCount || item.ordersCount) ? ", reported days only, incomplete data" : ""}`;

  return (
    <section className="space-y-3" aria-label="Sales insights">
      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-muted p-1" role="group" aria-label="Insight period">
        {(["Daily", "Weekly", "Monthly"] as const).map((option) => (
          <button key={option} type="button" aria-pressed={period === option} onClick={() => { setPeriod(option); setSelectedDate(null); }}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${period === option ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {option}
          </button>
        ))}
      </div>
      <Card className="overflow-hidden rounded-xl border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <div className="rounded-xl bg-primary/10 p-3 text-primary"><TrendingUp className="h-6 w-6" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Sales · {selected ? intervalLabel(selected) : "Selected range"}</p>
            <p className="text-2xl font-bold tabular-nums sm:text-3xl">{selected?.revenueCount ? formatRinggit(selected.revenue) : "—"}</p>
            {selected?.incomplete && <p className="text-xs text-muted-foreground">{selected.revenueCount || selected.ordersCount ? "Reported days only · incomplete data" : "No data for this interval"}</p>}
          </div>
          <div className="border-l border-border pl-5">
            <p className="text-sm text-muted-foreground">Orders</p>
            <p className="text-2xl font-bold tabular-nums">{selected?.ordersCount ? selected.orders : "—"}</p>
          </div>
        </div>
        <div id="sales-insight-chart" hidden={!expanded} className="border-t border-border p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{metric} by {period.toLowerCase()} interval · within the selected date range</p>
              <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Chart metric">
                {(["Revenue", "Orders"] as const).map((option) => <button key={option} type="button" aria-pressed={metric === option} onClick={() => setMetric(option)} className={`rounded-md px-3 py-1 text-xs font-medium ${metric === option ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>{option}</button>)}
              </div>
            </div>
            {intervals.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground" role="status">No sales in this range.</p> : (
              <>
                <div className="flex min-w-0 gap-2">
                  <div aria-label="Chart scale" className="flex h-56 shrink-0 flex-col justify-between text-right text-xs tabular-nums text-muted-foreground">
                    <span>{maximum > 0 ? (metric === "Revenue" ? formatRinggit(maximum) : maximum) : ""}</span>
                    <span>{metric === "Revenue" ? formatRinggit(0) : "0"}</span>
                  </div>
                  <div ref={chartRef} className="min-w-0 flex-1 overflow-x-auto">
                  <div className="flex h-56 items-end gap-1 border-b border-border" style={{ minWidth: `${Math.max(100, intervals.length * 34)}px` }}>
                    {intervals.map((item) => (
                      <button key={item.key} type="button" aria-pressed={selected?.key === item.key}
                        aria-label={describeInterval(item)}
                        title={describeInterval(item)}
                        onClick={() => setSelectedDate(item.from)}
                        className="group flex h-full min-w-7 flex-1 items-end justify-center rounded-t focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                        {(metric === "Revenue" ? item.revenueCount : item.ordersCount) > 0 && <span className={`w-3 max-w-full rounded-t ${selected?.key === item.key ? "bg-sesame" : "bg-muted-foreground group-hover:bg-foreground"}`} style={{ height: `${maximum > 0 ? (metric === "Revenue" ? item.revenue : item.orders) / maximum * 100 : 0}%` }} />}
                      </button>
                    ))}
                  </div>
                  <div aria-hidden={true} className="mt-2 flex gap-1 text-xs text-muted-foreground" style={{ minWidth: `${Math.max(100, intervals.length * 34)}px` }}>
                    {intervals.map((item, index) => (
                      <div key={item.key} className="relative min-w-7 flex-1">
                        {index % labelEvery === 0 && <span className={`absolute whitespace-nowrap ${index === 0 ? "left-0" : "left-1/2 -translate-x-1/2"}`}>{tickLabel(item)}</span>}
                      </div>
                    ))}
                  </div>
                  <div className="h-5" />
                  </div>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-muted-foreground">View as a table</summary>
                  <div className="mt-2 max-h-64 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <caption className="sr-only">Sales by interval for the selected range</caption>
                      <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th scope="col" className="py-1 pr-3">Interval</th><th scope="col" className="py-1 pr-3 text-right">Revenue</th><th scope="col" className="py-1 text-right">Orders</th></tr></thead>
                      <tbody>{intervals.map((item) => <tr key={item.key} className="border-t border-border/50"><td className="py-1 pr-3">{intervalLabel(item)}{item.incomplete && (item.revenueCount > 0 || item.ordersCount > 0) ? " (reported days only; incomplete data)" : ""}</td><td className="py-1 pr-3 text-right tabular-nums">{item.revenueCount ? formatRinggit(item.revenue) : "—"}</td><td className="py-1 text-right tabular-nums">{item.ordersCount ? item.orders : "—"}</td></tr>)}</tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
        </div>
        <button type="button" aria-expanded={expanded} aria-controls="sales-insight-chart" onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-center gap-2 border-t border-border px-4 py-4 text-sm font-semibold text-primary hover:bg-muted/50">
          {expanded ? "See less insight" : "See more insight"}
          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
      </Card>
    </section>
  );
}
