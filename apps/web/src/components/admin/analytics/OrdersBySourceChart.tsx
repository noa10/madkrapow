"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SOURCE_COLORS = [
  "hsl(200 80% 55%)",
  "hsl(220 80% 60%)",
  "hsl(150 70% 45%)",
  "hsl(270 70% 60%)",
];

export interface SourceChartPoint {
  name: string;
  value: number;
}

/**
 * Recharts-loaded "Orders by Source" card. Kept as its own dynamic chunk so
 * the pie chart's code is fetched only when this section renders.
 */
export function OrdersBySourceChart({ sourceData }: { sourceData: SourceChartPoint[] }) {
  return (
    <Card className="bg-card border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="font-display">Orders by Source</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={sourceData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              label={({ name, value }) => `${name}: ${value}`}
            >
              {sourceData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={SOURCE_COLORS[index % SOURCE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-4 flex-wrap">
          {sourceData.map((entry, index) => (
            <div key={entry.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: SOURCE_COLORS[index % SOURCE_COLORS.length] }}
              />
              <span className="text-sm">
                {entry.name}: {entry.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
