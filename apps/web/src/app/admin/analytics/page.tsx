"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartSkeleton } from "@/components/admin/analytics/ChartSkeleton";
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval } from "date-fns";
import { DollarSign, Package, ShoppingCart, TrendingUp, Calendar } from "lucide-react";
import { useRoleGuard } from "@/hooks/use-role-guard";

// Recharts is fetched only when these chart sections render, not with every
// admin page's initial JS.
const RevenueCharts = dynamic(
  () =>
    import("@/components/admin/analytics/RevenueCharts").then(
      (mod) => mod.RevenueCharts
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-4 md:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    ),
  }
);

const OrdersBySourceChart = dynamic(
  () =>
    import("@/components/admin/analytics/OrdersBySourceChart").then(
      (mod) => mod.OrdersBySourceChart
    ),
  {
    ssr: false,
    loading: () => <ChartSkeleton chartHeight={200} />,
  }
);

interface TopSellingItem {
  name: string;
  quantity: number;
  revenue: number;
}

interface AnalyticsOrder {
  created_at: string;
  customer_id: string | null;
  total_cents: number | null;
  source: string;
}

interface AnalyticsOrderItem {
  menu_item_name: string;
  quantity: number | null;
  line_total_cents: number | null;
}

type DateRange = "7d" | "30d" | "90d" | "custom";

export default function AnalyticsPage() {
  const { hasAccess, isLoading: guardLoading } = useRoleGuard(["admin"]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    totalItemsSold: 0,
  });
  const [salesData, setSalesData] = useState<{ date: string; revenue: number; orders: number }[]>([]);
  const [topSellingItems, setTopSellingItems] = useState<TopSellingItem[]>([]);
  const [customerData, setCustomerData] = useState({ new: 0, returning: 0 });
  const [sourceData, setSourceData] = useState<{ name: string; value: number }[]>([]);

  const getDateRangeParams = useCallback(() => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (dateRange === "custom" && customStart && customEnd) {
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
    } else if (dateRange === "7d") {
      startDate = subDays(now, 7);
    } else if (dateRange === "30d") {
      startDate = subDays(now, 30);
    } else {
      startDate = subDays(now, 90);
    }

    return { startDate, endDate };
  }, [dateRange, customStart, customEnd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = getBrowserClient();
    const { startDate, endDate } = getDateRangeParams();

    const startISO = startOfDay(startDate).toISOString();
    const endISO = endOfDay(endDate).toISOString();

    const [ordersRes, itemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("created_at, customer_id, total_cents, source")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .in("status", ["paid", "accepted", "preparing", "ready", "picked_up", "delivered"]),

      supabase
        .from("order_items")
        .select("menu_item_name, quantity, line_total_cents")
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    const ordersData: AnalyticsOrder[] = ordersRes.data ?? [];
    const itemsData: AnalyticsOrderItem[] = itemsRes.data ?? [];

    const totalRevenue = ordersData.reduce((sum, o) => sum + (o.total_cents || 0), 0);
    const totalOrders = ordersData.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalItemsSold = itemsData.reduce((sum, item) => sum + (item.quantity || 0), 0);

    setStats({
      totalRevenue,
      totalOrders,
      avgOrderValue,
      totalItemsSold,
    });

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const salesByDay = days.map((day) => {
      const dayOrders = ordersData.filter((o) => {
        const orderDate = new Date(o.created_at);
        return format(orderDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
      });
      return {
        date: format(day, "MMM d"),
        revenue: dayOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0) / 100,
        orders: dayOrders.length,
      };
    });
    setSalesData(salesByDay);

    const itemMap = new Map<string, { quantity: number; revenue: number }>();
    itemsData.forEach((item) => {
      const existing = itemMap.get(item.menu_item_name) || { quantity: 0, revenue: 0 };
      itemMap.set(item.menu_item_name, {
        quantity: existing.quantity + (item.quantity || 0),
        revenue: existing.revenue + (item.line_total_cents || 0) / 100,
      });
    });

    const topItems = Array.from(itemMap.entries())
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    setTopSellingItems(topItems);

    const uniqueCustomers = new Set(ordersData.map((o) => o.customer_id).filter(Boolean));
    const customerCount = uniqueCustomers.size;
    const returningCount = Math.floor(customerCount * 0.3);
    const newCount = customerCount - returningCount;

    setCustomerData({
      new: newCount || 1,
      returning: returningCount || 1,
    });

    const sourceMap = new Map<string, number>();
    ordersData.forEach((o) => {
      const s = o.source || "web";
      sourceMap.set(s, (sourceMap.get(s) || 0) + 1);
    });
    const sourcePie = Array.from(sourceMap.entries())
      .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
      .sort((a, b) => b.value - a.value);
    setSourceData(sourcePie);

    setLoading(false);
  }, [getDateRangeParams]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  const formatCurrency = (cents: number) => {
    return `RM ${(cents / 100).toFixed(2)}`;
  };

  const statCards = [
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      icon: DollarSign,
      bgClass: "bg-primary/10",
      colorClass: "text-primary",
    },
    {
      title: "Total Orders",
      value: stats.totalOrders,
      icon: ShoppingCart,
      bgClass: "bg-sky-400/10",
      colorClass: "text-sky-400",
    },
    {
      title: "Avg Order Value",
      value: formatCurrency(stats.avgOrderValue),
      icon: TrendingUp,
      bgClass: "bg-emerald-400/10",
      colorClass: "text-emerald-400",
    },
    {
      title: "Items Sold",
      value: stats.totalItemsSold,
      icon: Package,
      bgClass: "bg-amber-400/10",
      colorClass: "text-amber-400",
    },
  ];

  const customerPieData = [
    { name: "New Customers", value: customerData.new },
    { name: "Returning", value: customerData.returning },
  ];

  if (guardLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasAccess) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display">Analytics</h1>
        
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="bg-background border-border rounded-md px-3 py-2 text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="custom">Custom Range</option>
          </select>

          {dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="bg-card border-border shadow-sm rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`rounded-lg p-1.5 ${stat.bgClass}`}>
                <stat.icon className={`h-4 w-4 ${stat.colorClass}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <RevenueCharts salesData={salesData} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card border-border shadow-sm rounded-xl">
          <CardHeader>
            <CardTitle className="font-display">Top Selling Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topSellingItems.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No data available</p>
              ) : (
                topSellingItems.map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{index + 1}</Badge>
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(item.revenue * 100)}</div>
                      <div className="text-sm text-muted-foreground">{item.quantity} sold</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <OrdersBySourceChart sourceData={sourceData} />
      </div>
    </div>
  );
}
