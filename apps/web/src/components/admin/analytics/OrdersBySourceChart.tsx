"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface SourceChartPoint {
  name: string;
  value: number;
}

const SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  grabfood: "GrabFood",
  foodpanda: "foodpanda",
  counter: "Counter",
  table_qr: "Table QR",
  pos: "POS",
};

/** Display names come from the page when it already maps them; this is the fallback. */
function labelFor(source: string) {
  return SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

/**
 * Ranked order counts per sales channel.
 *
 * A ranked single-hue bar list is used instead of a pie: channels are compared
 * by magnitude, the list stays readable when more than four channels exist, and
 * the count is written next to every bar so colour is never the only signal.
 */
export function OrdersBySourceChart({ sourceData }: { sourceData: SourceChartPoint[] }) {
  const total = sourceData.reduce((sum, entry) => sum + entry.value, 0);
  const max = sourceData.reduce((highest, entry) => Math.max(highest, entry.value), 0);

  return (
    <Card className="bg-card border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="font-display">Orders by source</CardTitle>
      </CardHeader>
      <CardContent>
        {sourceData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground" role="status">
            No orders in this range.
          </p>
        ) : (
          <ul className="space-y-3">
            {sourceData.map((entry) => {
              const share = total > 0 ? entry.value / total : 0;
              const width = max > 0 ? Math.max((entry.value / max) * 100, 2) : 0;
              return (
                <li key={entry.name} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{labelFor(entry.name)}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {entry.value} · {Math.round(share * 100)}%
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full bg-muted"
                    role="img"
                    aria-label={`${labelFor(entry.name)}: ${entry.value} orders, ${Math.round(share * 100)}% of the range`}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
