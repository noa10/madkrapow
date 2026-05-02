import { getServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Clock, DollarSign, TrendingUp } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminDashboard() {
  const supabase = await getServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const userRole = (user.app_metadata?.role as string) || null;
  const staffRoles = ["admin", "manager", "cashier", "kitchen"];
  if (!userRole || !staffRoles.includes(userRole)) {
    redirect("/");
  }

  // Get start of today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // Fetch today's orders
  const { data: todayOrders } = await supabase
    .from("orders")
    .select("*")
    .gte("created_at", todayISO);

  const { count: pendingOrders } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  // Calculate stats
  const todayRevenue = todayOrders?.reduce((sum, order) => {
    return sum + (order.total_cents || 0);
  }, 0) || 0;

  const todayCount = todayOrders?.length || 0;
  const avgOrderValue = todayCount > 0 ? todayRevenue / todayCount : 0;

  const stats = [
    {
      title: "Today's Revenue",
      value: todayRevenue,
      icon: DollarSign,
      color: "text-emerald-500",
    },
    {
      title: "Today's Orders",
      value: todayCount,
      icon: Package,
      color: "text-sky-500",
    },
    {
      title: "Pending Orders",
      value: pendingOrders || 0,
      icon: Clock,
      color: "text-amber-500",
    },
    {
      title: "Avg Order Value",
      value: avgOrderValue,
      icon: TrendingUp,
      color: "text-violet-500",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-heading">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stat.title.includes("Revenue") || stat.title.includes("Value")
                  ? `RM ${(Number(stat.value) / 100).toFixed(2)}`
                  : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              <Link href="/admin/orders" className="text-primary hover:text-primary/80 hover:underline">
                View all orders →
              </Link>
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/admin/menu"
              className="block text-sm text-primary hover:text-primary/80 hover:underline"
            >
              Manage Menu →
            </Link>
            <Link
              href="/admin/settings"
              className="block text-sm text-primary hover:text-primary/80 hover:underline"
            >
              Store Settings →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}