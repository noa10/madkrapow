"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SalesChartPoint {
  /** Short axis label, e.g. "27 Nov". */
  label: string;
  /** ISO business date, used as the stable key and in the data table. */
  date: string;
  /** Revenue in cents, or null when the day had no sales. */
  revenueCents: number | null;
  /** Order count, or null when the day had no sales. */
  orders: number | null;
}

type Metric = "revenue" | "orders";

function formatRinggit(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`;
}

function formatValue(metric: Metric, value: number | null) {
  if (value === null) return "No sales";
  return metric === "revenue" ? formatRinggit(value) : `${value} order${value === 1 ? "" : "s"}`;
}

/**
 * Recharts-heavy revenue trend, loaded through `next/dynamic` so the library
 * only enters the admin bundle when this section actually renders.
 *
 * One metric is plotted at a time: revenue and orders have different units, so
 * sharing a single axis would be misleading. Days without sales stay as gaps
 * instead of being drawn as zero-revenue days.
 */
export function RevenueCharts({ salesData }: { salesData: SalesChartPoint[] }) {
  const [metric, setMetric] = useState<Metric>("revenue");
  const hasSales = salesData.some((point) => point.revenueCents !== null);

  return (
    <Card className="bg-card border-border shadow-sm rounded-xl">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <CardTitle className="font-display">Sales trend</CardTitle>
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Chart metric">
          {(["revenue", "orders"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={metric === option}
              onClick={() => setMetric(option)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                metric === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {!hasSales ? (
          <p className="py-16 text-center text-sm text-muted-foreground" role="status">
            No sales in this range.
          </p>
        ) : (
          <>
            {/* currentColor keeps the series on the brand accent token, which is
                defined in oklch and therefore cannot be hardcoded as an hsl(). */}
            <div className="text-primary">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={salesData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="sales-trend-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} minTickGap={24} tickLine={false} />
                  <YAxis
                    fontSize={12}
                    width={metric === "revenue" ? 72 : 40}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) =>
                      metric === "revenue" ? `RM ${Math.round(value / 100)}` : String(value)
                    }
                  />
                  <Tooltip
                    formatter={(value) => [
                      formatValue(metric, typeof value === "number" ? value : null),
                      metric === "revenue" ? "Revenue" : "Orders",
                    ]}
                    labelFormatter={(label) => String(label)}
                  />
                  <Area
                    type="monotone"
                    dataKey={metric === "revenue" ? "revenueCents" : "orders"}
                    stroke="currentColor"
                    strokeWidth={2}
                    fill="url(#sales-trend-fill)"
                    connectNulls={false}
                    dot={false}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                View as a table
              </summary>
              <div className="mt-2 max-h-64 overflow-auto">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Sales per day for the selected range</caption>
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">Revenue</th>
                      <th scope="col" className="py-1 text-right font-medium">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesData.map((point) => (
                      <tr key={point.date} className="border-t border-border/50">
                        <td className="py-1 pr-3">{point.date}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">
                          {point.revenueCents === null ? "—" : formatRinggit(point.revenueCents)}
                        </td>
                        <td className="py-1 text-right tabular-nums">{point.orders ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
