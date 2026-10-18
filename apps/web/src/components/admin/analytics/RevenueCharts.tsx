"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SalesChartPoint {
  date: string;
  revenue: number;
  orders: number;
}

function formatCurrency(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`;
}

/**
 * Recharts-heavy revenue cards, loaded through `next/dynamic` so the library
 * only enters the admin bundle when a chart section actually renders.
 */
export function RevenueCharts({ salesData }: { salesData: SalesChartPoint[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="font-display">Revenue &amp; Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis yAxisId="left" fontSize={12} />
              <YAxis yAxisId="right" orientation="right" fontSize={12} />
              <Tooltip
                formatter={(value, name) => {
                  const numValue = typeof value === "number" ? value : 0;
                  const strName = typeof name === "string" ? name : "";
                  return [
                    strName === "revenue" ? formatCurrency(numValue * 100) : numValue,
                    strName === "revenue" ? "Revenue" : "Orders",
                  ];
                }}
              />
              <Bar yAxisId="left" dataKey="revenue" fill="hsl(38 60% 55%)" name="revenue" />
              <Bar yAxisId="right" dataKey="orders" fill="hsl(192 80% 50%)" name="orders" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-card border-border shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="font-display">Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip
                formatter={(value) => {
                  const numValue = typeof value === "number" ? value : 0;
                  return [formatCurrency(numValue * 100), "Revenue"];
                }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(38 60% 55%)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
