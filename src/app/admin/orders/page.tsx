"use client";

import { useEffect, useState, useMemo } from "react";
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
  total_cents: number;
  delivery_fee_cents: number;
  created_at: string;
  delivery_address_json: string | Record<string, unknown> | null;
  customer_phone: string | null;
  customer_name: string | null;
  delivery_type: string;
  fulfillment_type: string;
  dispatch_status: string | null;
  scheduled_for: string | null;
  order_kind: string;
  approval_status: string;
  bulk_company_name: string | null;
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

const FILTER_TABS = [
  { value: 'all', label: 'All' },
  { value: 'asap', label: 'ASAP' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'bulk', label: 'Bulk' },
  { value: 'dispatch_failed', label: 'Dispatch Failed' },
] as const;

type FilterValue = typeof FILTER_TABS[number]['value'];

function getAddressString(address: string | Record<string, unknown> | null): string {
  if (!address) return 'No address'
  if (typeof address === 'string') return address
  const parts = [
    address.address_line1 as string,
    address.address_line2 as string,
    address.city as string,
    address.state as string,
  ].filter(Boolean)
  return parts.join(', ') || 'No address'
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterValue>('all');

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

  const filteredOrders = useMemo(() => {
    if (activeFilter === 'all') return orders
    if (activeFilter === 'asap') return orders.filter(o => o.fulfillment_type === 'asap')
    if (activeFilter === 'scheduled') return orders.filter(o => o.fulfillment_type === 'scheduled')
    if (activeFilter === 'pickup') return orders.filter(o => o.delivery_type === 'self_pickup')
    if (activeFilter === 'bulk') return orders.filter(o => o.order_kind === 'bulk')
    if (activeFilter === 'dispatch_failed') return orders.filter(o => o.dispatch_status === 'failed')
    return orders
  }, [orders, activeFilter])

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
            <Badge variant="secondary">{filteredOrders.length} orders</Badge>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {FILTER_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={activeFilter === tab.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter(tab.value)}
              className="whitespace-nowrap"
            >
              {tab.label}
            </Button>
          ))}
        </div>

      {filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No orders match this filter</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
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
                      {order.delivery_type === 'self_pickup' && (
                        <Badge variant="outline">Pickup</Badge>
                      )}
                      {order.fulfillment_type === 'scheduled' && (
                        <Badge variant="outline">Scheduled</Badge>
                      )}
                      {order.order_kind === 'bulk' && (
                        <Badge className="bg-purple-500/20 text-purple-500 border-purple-500/50">
                          Bulk {order.approval_status === 'pending_review' ? '- Review' : order.approval_status === 'approved' ? '- Approved' : ''}
                        </Badge>
                      )}
                      {order.dispatch_status === 'failed' && (
                        <Badge variant="destructive">Dispatch Failed</Badge>
                      )}
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
                    {order.delivery_type === 'delivery' && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{getAddressString(order.delivery_address_json)}</span>
                      </div>
                    )}
                    {order.scheduled_for && (
                      <div className="text-muted-foreground">
                        Scheduled for: {format(new Date(order.scheduled_for), "MMM d, h:mm a")}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2">
                      <span className="font-semibold">
                        RM {((order.total_cents + order.delivery_fee_cents) / 100).toFixed(2)}
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
