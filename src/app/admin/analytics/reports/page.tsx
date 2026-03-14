"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState, useMemo, useCallback } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileSpreadsheet, Calendar, Filter } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_cents: number;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  created_at: string;
  stripe_payment_intent_id: string | null;
}

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  menu_item_name: string;
  quantity: number;
  line_total_cents: number;
}

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  category_id: string;
  name: string;
}

interface ReportData {
  orders: Order[];
  orderItems: OrderItem[];
  categories: Category[];
  menuItems: MenuItem[];
}

type DatePreset = "today" | "yesterday" | "last7days" | "last30days" | "thisWeek" | "thisMonth" | "custom";

function getDateRange(preset: DatePreset, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = startOfDay(subDays(now, 1));
  
  switch (preset) {
    case "today":
      return { start: today, end: endOfDay(now) };
    case "yesterday":
      return { start: yesterday, end: endOfDay(yesterday) };
    case "last7days":
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case "last30days":
      return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
    case "thisWeek":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "thisMonth":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "custom":
      return {
        start: startOfDay(new Date(customStart || now)),
        end: endOfDay(new Date(customEnd || now))
      };
    default:
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
  }
}

function convertCentsToRM(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function SalesReportsPage() {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("last7days");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const fetchReportData = useCallback(async () => {
    if (isInitialLoad) {
      setIsInitialLoad(false);
    }
    setLoading(true);
    const supabase = getBrowserClient();
    
    const { start, end } = getDateRange(datePreset, customStart, customEnd);

    const [ordersRes, orderItemsRes, categoriesRes, menuItemsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .in("status", ["paid", "completed"]),
      supabase
        .from("order_items")
        .select("*"),
      supabase
        .from("categories")
        .select("id, name")
        .eq("is_active", true),
      supabase
        .from("menu_items")
        .select("id, category_id, name"),
    ]);

    setReportData({
      orders: ordersRes.data || [],
      orderItems: orderItemsRes.data || [],
      categories: categoriesRes.data || [],
      menuItems: menuItemsRes.data || [],
    });
    setLoading(false);
  }, [datePreset, customStart, customEnd, isInitialLoad]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const filteredData = useMemo(() => {
    if (!reportData) return null;

    let orders = [...reportData.orders];

    if (paymentMethodFilter !== "all") {
      if (paymentMethodFilter === "card") {
        orders = orders.filter(o => o.stripe_payment_intent_id);
      } else if (paymentMethodFilter === "cash") {
        orders = orders.filter(o => !o.stripe_payment_intent_id);
      }
    }

    const orderIds = new Set(orders.map(o => o.id));
    const orderItems = reportData.orderItems.filter(oi => orderIds.has(oi.order_id));

    if (categoryFilter !== "all") {
      const menuItemIds = new Set(
        reportData.menuItems
          .filter(mi => mi.category_id === categoryFilter)
          .map(mi => mi.id)
      );
      const filteredOrderItemIds = new Set(
        orderItems
          .filter(oi => menuItemIds.has(oi.menu_item_id))
          .map(oi => oi.id)
      );
      orders = orders.filter(o => {
        const oiIds = reportData.orderItems.filter(oi => oi.order_id === o.id).map(oi => oi.id);
        return oiIds.some(id => filteredOrderItemIds.has(id));
      });
    }

    return { orders, orderItems };
  }, [reportData, categoryFilter, paymentMethodFilter]);

  const stats = useMemo(() => {
    if (!filteredData) return null;
    
    const { orders, orderItems } = filteredData;
    
    const totalRevenue = orders.reduce((sum, o) => sum + o.total_cents, 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalDeliveryFees = orders.reduce((sum, o) => sum + o.delivery_fee_cents, 0);
    const totalDiscounts = orders.reduce((sum, o) => sum + o.discount_cents, 0);

    const categoryRevenue: Record<string, number> = {};
    const menuItemIdToCategory: Record<string, string> = {};
    reportData?.menuItems.forEach(mi => {
      menuItemIdToCategory[mi.id] = mi.category_id;
    });
    
    orderItems.forEach(oi => {
      const categoryId = menuItemIdToCategory[oi.menu_item_id];
      if (categoryId) {
        categoryRevenue[categoryId] = (categoryRevenue[categoryId] || 0) + oi.line_total_cents;
      }
    });

    const categoryBreakdown = reportData?.categories.map(cat => ({
      name: cat.name,
      revenue: categoryRevenue[cat.id] || 0,
      percentage: totalRevenue > 0 ? ((categoryRevenue[cat.id] || 0) / totalRevenue) * 100 : 0,
    })) || [];

    const cardPayments = orders.filter(o => o.stripe_payment_intent_id).length;
    const cashPayments = orders.length - cardPayments;
    const cardRevenue = orders.filter(o => o.stripe_payment_intent_id).reduce((sum, o) => sum + o.total_cents, 0);
    const cashRevenue = orders.filter(o => !o.stripe_payment_intent_id).reduce((sum, o) => sum + o.total_cents, 0);

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      totalDeliveryFees,
      totalDiscounts,
      categoryBreakdown: categoryBreakdown.sort((a, b) => b.revenue - a.revenue),
      paymentMethodBreakdown: [
        { method: "Card (Stripe)", count: cardPayments, revenue: cardRevenue },
        { method: "Cash", count: cashPayments, revenue: cashRevenue },
      ],
    };
  }, [filteredData, reportData]);

  const exportToCSV = () => {
    if (!filteredData || !stats) return;

    const { orders } = filteredData;
    
    const headers = [
      "Order Number",
      "Date",
      "Status",
      "Subtotal (RM)",
      "Delivery Fee (RM)",
      "Discount (RM)",
      "Total (RM)",
      "Payment Method",
    ];

    const rows = orders.map(order => [
      order.order_number,
      format(new Date(order.created_at), "yyyy-MM-dd HH:mm"),
      order.status,
      convertCentsToRM(order.subtotal_cents),
      convertCentsToRM(order.delivery_fee_cents),
      convertCentsToRM(order.discount_cents),
      convertCentsToRM(order.total_cents),
      order.stripe_payment_intent_id ? "Card (Stripe)" : "Cash",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `sales-report-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sales Reports</h1>
        <Button onClick={exportToCSV} disabled={!filteredData || loading}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Date Range</label>
              <Select value={datePreset} onValueChange={(v: string) => setDatePreset(v as DatePreset)}>
                <SelectTrigger placeholder="Select date range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7days">Last 7 Days</SelectItem>
                  <SelectItem value="last30days">Last 30 Days</SelectItem>
                  <SelectItem value="thisWeek">This Week</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {datePreset === "custom" && (
              <>
                <div>
                  <label className="text-sm font-medium mb-1 block">Start Date</label>
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">End Date</label>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </>
            )}

            <div>
              <label className="text-sm font-medium mb-1 block">Category</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger placeholder="All Categories">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {reportData?.categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Payment Method</label>
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger placeholder="All Methods">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="card">Card (Stripe)</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchReportData} disabled={loading}>
              <Calendar className="h-4 w-4 mr-2" />
              Refresh Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : stats && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">RM {convertCentsToRM(stats.totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalOrders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Order Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">RM {convertCentsToRM(stats.avgOrderValue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Delivery Fees</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">RM {convertCentsToRM(stats.totalDeliveryFees)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Discounts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">RM {convertCentsToRM(stats.totalDiscounts)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Revenue by Category
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stats.categoryBreakdown.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.categoryBreakdown.map((cat) => (
                        <TableRow key={cat.name}>
                          <TableCell>{cat.name}</TableCell>
                          <TableCell className="text-right">RM {convertCentsToRM(cat.revenue)}</TableCell>
                          <TableCell className="text-right">{cat.percentage.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-gray-500 text-sm">No data available</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Payment Method Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.paymentMethodBreakdown.map((pm) => (
                      <TableRow key={pm.method}>
                        <TableCell>{pm.method}</TableCell>
                        <TableCell className="text-right">{pm.count}</TableCell>
                        <TableCell className="text-right">RM {convertCentsToRM(pm.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredData?.orders.length && filteredData.orders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">Delivery</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.orders.slice(0, 100).map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>{format(new Date(order.created_at), "MMM dd, HH:mm")}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            order.status === "completed" ? "bg-green-100 text-green-800" :
                            order.status === "paid" ? "bg-blue-100 text-blue-800" :
                            "bg-yellow-100 text-yellow-800"
                          }`}>
                            {order.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">RM {convertCentsToRM(order.subtotal_cents)}</TableCell>
                        <TableCell className="text-right">RM {convertCentsToRM(order.delivery_fee_cents)}</TableCell>
                        <TableCell className="text-right">-RM {convertCentsToRM(order.discount_cents)}</TableCell>
                        <TableCell className="text-right font-medium">RM {convertCentsToRM(order.total_cents)}</TableCell>
                        <TableCell>{order.stripe_payment_intent_id ? "Card" : "Cash"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-gray-500 text-sm">No orders found for the selected filters</p>
              )}
              {filteredData && filteredData.orders.length > 100 && (
                <p className="text-sm text-gray-500 mt-4">
                  Showing first 100 of {filteredData.orders.length} orders. Export to CSV for complete data.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
