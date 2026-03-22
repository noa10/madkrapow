"use client";

import { useEffect, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Package, MapPin, Phone, User } from "lucide-react";
import Link from "next/link";
import { NewOrderAlert, triggerNewOrderAlert } from "@/components/admin/NewOrderAlert";

interface Order {
  id: string;
  status: string;
  total_amount: number;
  delivery_fee: number;
  created_at: string;
  delivery_address: string;
  customer_phone: string | null;
  customer_name: string | null;
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-amber-500/20 text-amber-500 border-amber-500/50", label: "Pending" },
  paid: { color: "bg-sky-500/20 text-sky-500 border-sky-500/50", label: "Paid" },
  accepted: { color: "bg-violet-500/20 text-violet-500 border-violet-500/50", label: "Accepted" },
  preparing: { color: "bg-orange-500/20 text-orange-500 border-orange-500/50", label: "Preparing" },
  ready: { color: "bg-emerald-500/20 text-emerald-500 border-emerald-500/50", label: "Ready" },
  picked_up: { color: "bg-indigo-500/20 text-indigo-500 border-indigo-500/50", label: "Picked Up" },
  delivered: { color: "bg-teal-500/20 text-teal-500 border-teal-500/50", label: "Delivered" },
  cancelled: { color: "bg-destructive/20 text-destructive border-destructive/50", label: "Cancelled" },
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    
    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setError(error.message);
        return;
      }

      setOrders(data || []);
      setLoading(false);
    };

    fetchOrders();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("admin-orders-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          setOrders((prev) => [payload.new as Order, ...prev]);
          triggerNewOrderAlert();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          const nextOrder = payload.new as Order;
          setOrders((prev) =>
            prev.map((order) =>
              order.id === nextOrder.id ? nextOrder : order
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600 text-center">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <NewOrderAlert />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Orders</h1>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{orders.length} total</Badge>
          </div>
        </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No orders yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            return (
              <Card key={order.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-semibold hover:text-primary"
                      >
                        Order #{order.id.slice(0, 8)}
                      </Link>
                      <Badge className={statusConfig.color}>
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(order.created_at), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{order.customer_name || "Guest"}</span>
                      {order.customer_phone && (
                        <a
                          href={`tel:${order.customer_phone}`}
                          className="text-primary ml-2"
                        >
                          <Phone className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{order.delivery_address}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2">
                      <span className="font-semibold">
                        RM {(order.total_amount + order.delivery_fee).toFixed(2)}
                      </span>
                      <Button size="sm" asChild>
                        <Link href={`/admin/orders/${order.id}`}>View Details</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  </>
  );
}
