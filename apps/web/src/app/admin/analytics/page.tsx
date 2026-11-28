"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Package, ShoppingCart, TrendingUp } from "lucide-react";
import { useRoleGuard } from "@/hooks/use-role-guard";
import { OrdersBySourceChart } from "@/components/admin/analytics/OrdersBySourceChart";
import { RevenueCharts } from "@/components/admin/analytics/RevenueCharts";
import type { SalesChartPoint } from "@/components/admin/analytics/RevenueCharts";

interface TrendRow {
  order_date: string;
  order_count: number;
  revenue_cents: number;
}

interface AnalyticsResponse {
  range: { from: string; to: string };
  pulse: {
    order_count: number;
    revenue_cents: number;
    avg_order_cents: number;
    delivery_count: number;
    pickup_count: number;
    dine_in_count: number;
  };
  totals: { order_count: number; revenue_cents: number };
  trends: TrendRow[];
  top_items: {
    menu_item_name: string;
    menu_item_id: string | null;
    total_quantity: number;
    total_revenue_cents: number;
  }[];
  items_sold: number;
  sources: { source: string; order_count: number }[];
}

type DateRange = "7d" | "30d" | "90d" | "custom";

/**
 * One slot for the settled outcome of a request, keyed by its query. Keeping a
 * single slot means a failure can never outlive the request that replaced it.
 */
type AnalyticsState =
  | { query: string; status: "success"; data: AnalyticsResponse }
  | { query: string; status: "error"; message: string };

const RANGE_OPTIONS: { value: Exclude<DateRange, "custom">; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const MAX_RANGE_DAYS = 366;

/** A stalled request must fail visibly instead of leaving the page spinning. */
const REQUEST_TIMEOUT_MS = 15_000;

const formatRinggit = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

/** Inclusive list of YYYY-MM-DD strings, computed in UTC so no timezone shifts a day. */
function enumerateDays(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  const days: string[] = [];
  for (let time = start; time <= end && days.length <= MAX_RANGE_DAYS; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortLabel(isoDate: string) {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  counter: "Counter POS",
  grabfood: "GrabFood",
  foodpanda: "Foodpanda",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

export default function AnalyticsPage() {
  const { hasAccess, isLoading: guardLoading } = useRoleGuard(["admin"]);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [state, setState] = useState<AnalyticsState | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const customRangeError = useMemo(() => {
    if (dateRange !== "custom") return null;
    if (!isIsoDate(customStart) || !isIsoDate(customEnd)) return "Select a valid start and end date.";
    if (customStart > customEnd) return "The start date must be on or before the end date.";
    if (enumerateDays(customStart, customEnd).length > MAX_RANGE_DAYS) {
      return `Pick a range of ${MAX_RANGE_DAYS} days or fewer.`;
    }
    return null;
  }, [dateRange, customStart, customEnd]);

  const query = useMemo(() => {
    if (dateRange === "custom") {
      if (customRangeError) return null;
      return `from=${customStart}&to=${customEnd}`;
    }
    return `range=${dateRange}`;
  }, [dateRange, customRangeError, customStart, customEnd]);

  useEffect(() => {
    if (guardLoading) return;
    // Without a query the page renders the validation message instead of results.
    if (!hasAccess || !query) return;
    // The cleanup aborts the previous request, so a slow earlier range can never
    // overwrite a newer one. Results are also keyed by query, so a response that
    // slips through after an abort is ignored when it is rendered.
    const controller = new AbortController();
    const requestedQuery = query;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    fetch(`/api/admin/analytics?${requestedQuery}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Analytics request failed with status ${response.status}`);
        return (await response.json()) as AnalyticsResponse;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setState({ query: requestedQuery, status: "success", data: payload });
      })
      .catch((fetchError: unknown) => {
        // A cleanup abort is not a failure: another range is already loading.
        if (controller.signal.aborted && !timedOut) return;
        console.error("Failed to load analytics:", fetchError);
        setState({
          query: requestedQuery,
          status: "error",
          message: timedOut
            ? "Analytics took too long to load. Please try again."
            : "Unable to load analytics. Please try again or pick another date range.",
        });
      })
      .finally(() => clearTimeout(timeoutId));
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [hasAccess, guardLoading, query, reloadToken]);

  // Loading is derived, not stored: a range is loading until its own request
  // settles. Only the newest query's outcome is kept, so a stale failure cannot
  // hide a fresh success for the range the user returned to.
  const current = state?.query === query ? state : null;
  const data = current?.status === "success" ? current.data : null;
  const error = current?.status === "error" ? current.message : null;
  const loading = Boolean(query) && current === null;

  const salesData: SalesChartPoint[] = useMemo(() => {
    if (!data) return [];
    const byDate = new Map(data.trends.map((row) => [row.order_date, row]));
    return enumerateDays(data.range.from, data.range.to).map((day) => {
      const row = byDate.get(day);
      return {
        date: day,
        label: shortLabel(day),
        revenueCents: row ? row.revenue_cents : 0,
        orders: row ? row.order_count : 0,
      };
    });
  }, [data]);

  const sourceData = useMemo(
    () =>
      (data?.sources ?? []).map((row) => ({
        name: SOURCE_LABELS[row.source] ?? row.source,
        value: row.order_count,
      })),
    [data]
  );

  const maxItemRevenue = useMemo(
    () => Math.max(0, ...(data?.top_items ?? []).map((item) => item.total_revenue_cents)),
    [data]
  );

  if (guardLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasAccess) return null;

  const totals = data?.totals ?? { order_count: 0, revenue_cents: 0 };
  const avgOrderCents = totals.order_count > 0 ? Math.round(totals.revenue_cents / totals.order_count) : 0;

  const statCards = [
    {
      title: "Range revenue",
      value: formatRinggit(totals.revenue_cents),
      hint: "Excludes cancelled orders",
      icon: DollarSign,
      bgClass: "bg-primary/10",
      colorClass: "text-primary",
    },
    {
      title: "Range orders",
      value: totals.order_count,
      hint: "Paid and fulfilled",
      icon: ShoppingCart,
      bgClass: "bg-sky-400/10",
      colorClass: "text-sky-400",
    },
    {
      title: "Avg order",
      value: formatRinggit(avgOrderCents),
      hint: "Revenue ÷ orders",
      icon: TrendingUp,
      bgClass: "bg-emerald-400/10",
      colorClass: "text-emerald-400",
    },
    {
      title: "Items sold",
      value: data?.items_sold ?? 0,
      hint: "Units across all items",
      icon: Package,
      bgClass: "bg-amber-400/10",
      colorClass: "text-amber-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Analytics</h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              {data.range.from} to {data.range.to}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={dateRange === option.value}
                onClick={() => setDateRange(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  dateRange === option.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={dateRange === "custom"}
              onClick={() => setDateRange("custom")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                dateRange === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Custom
            </button>
          </div>
        </div>
      </div>

      {dateRange === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="analytics-start">Start date</label>
          <input
            id="analytics-start"
            type="date"
            value={customStart}
            onChange={(event) => setCustomStart(event.target.value)}
            className="bg-background border-border rounded-md px-2 py-1 text-sm"
          />
          <span className="text-muted-foreground">to</span>
          <label className="sr-only" htmlFor="analytics-end">End date</label>
          <input
            id="analytics-end"
            type="date"
            value={customEnd}
            onChange={(event) => setCustomEnd(event.target.value)}
            className="bg-background border-border rounded-md px-2 py-1 text-sm"
          />
        </div>
      )}

      {customRangeError ? (
        <p className="text-sm text-muted-foreground" role="status">{customRangeError}</p>
      ) : loading ? (
        <div
          className="flex items-center justify-center min-h-[400px]"
          role="status"
          aria-label="Loading analytics"
        >
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-3" role="alert">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => {
              setState(null);
              setReloadToken((token) => token + 1);
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {data && (
            <Card className="bg-card border-border shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  Today
                  <span className="text-xs font-normal text-muted-foreground/70">
                    not affected by the range
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div>
                    <div className="text-xl font-bold font-display">
                      {formatRinggit(data.pulse.revenue_cents)}
                    </div>
                    <div className="text-xs text-muted-foreground">Revenue</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold font-display">{data.pulse.order_count}</div>
                    <div className="text-xs text-muted-foreground">Orders</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold font-display">
                      {formatRinggit(data.pulse.avg_order_cents)}
                    </div>
                    <div className="text-xs text-muted-foreground">Avg order</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold font-display">
                      {data.pulse.delivery_count + data.pulse.pickup_count + data.pulse.dine_in_count}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {data.pulse.delivery_count} delivery · {data.pulse.pickup_count} pickup ·{" "}
                      {data.pulse.dine_in_count} dine-in
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <RevenueCharts salesData={salesData} />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((stat) => (
              <Card key={stat.title} className="bg-card border-border shadow-sm rounded-xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`rounded-lg p-1.5 ${stat.bgClass}`}>
                    <stat.icon className={`h-4 w-4 ${stat.colorClass}`} aria-hidden="true" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">{stat.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="bg-card border-border shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="font-display">Top selling items</CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.top_items.length ?? 0) === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground" role="status">
                    No items sold in this range.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {data?.top_items.map((item, index) => {
                      const share = maxItemRevenue > 0 ? item.total_revenue_cents / maxItemRevenue : 0;
                      return (
                        <li key={item.menu_item_id ?? item.menu_item_name} className="space-y-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <Badge variant="secondary" className="shrink-0">{index + 1}</Badge>
                              <span className="truncate font-medium">{item.menu_item_name}</span>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="font-semibold tabular-nums">
                                {formatRinggit(item.total_revenue_cents)}
                              </div>
                              <div className="text-xs text-muted-foreground tabular-nums">
                                {item.total_quantity} sold
                              </div>
                            </div>
                          </div>
                          <div
                            className="h-1.5 rounded-full bg-muted"
                            role="img"
                            aria-label={`${item.menu_item_name}: ${formatRinggit(item.total_revenue_cents)}, ${item.total_quantity} sold`}
                          >
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.max(share * 100, 2)}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardContent>
            </Card>

            <OrdersBySourceChart sourceData={sourceData} />
          </div>
        </>
      )}
    </div>
  );
}
