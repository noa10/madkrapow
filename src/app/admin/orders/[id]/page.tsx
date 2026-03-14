"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { MapPin, Phone, User, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { StatusTransitionButtons } from "@/components/admin/StatusTransitionButtons";

interface OrderItem {
  id: string;
  menu_item: {
    name: string;
    price: number;
  };
  quantity: number;
  modifiers: {
    name: string;
    price: number;
  }[];
  special_instructions: string;
}

interface Order {
  id: string;
  status: string;
  total_amount: number;
  delivery_fee: number;
  created_at: string;
  delivery_address: string;
  customer_phone: string | null;
  customer_name: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_plate_number: string | null;
  order_items: OrderItem[];
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-yellow-100 text-yellow-800", label: "Pending" },
  paid: { color: "bg-blue-100 text-blue-800", label: "Paid" },
  accepted: { color: "bg-purple-100 text-purple-800", label: "Accepted" },
  preparing: { color: "bg-orange-100 text-orange-800", label: "Preparing" },
  ready: { color: "bg-green-100 text-green-800", label: "Ready" },
  picked_up: { color: "bg-indigo-100 text-indigo-800", label: "Picked Up" },
  delivered: { color: "bg-teal-100 text-teal-800", label: "Delivered" },
  cancelled: { color: "bg-red-100 text-red-800", label: "Cancelled" },
};

export default function AdminOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    
    const fetchOrder = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "*, order_items(*, menu_item:menu_items(name, price), modifiers(*))"
        )
        .eq("id", params.id)
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      setOrder(data);
      setLoading(false);
    };

    fetchOrder();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`admin-order-${params.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${params.id}` },
        (payload) => {
          setOrder(payload.new as Order);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <p className="text-red-600 text-center">{error || "Order not found"}</p>
          <Button asChild className="mt-4">
            <Link href="/admin/orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Orders
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const totalItems = order.order_items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/orders">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Order #{order.id.slice(0, 8)}</h1>
          <p className="text-muted-foreground">
            {format(new Date(order.created_at), "MMMM d, yyyy 'at' h:mm a")}
          </p>
        </div>
        <Badge className={statusConfig.color + " ml-auto"}>
          {statusConfig.label}
        </Badge>
      </div>

      <StatusTransitionButtons
        orderId={order.id}
        currentStatus={order.status}
        onStatusUpdate={(newStatus) => setOrder({ ...order, status: newStatus })}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Order Items */}
        <Card>
          <CardHeader>
            <CardTitle>Order Items ({totalItems})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {order.order_items?.map((item) => (
                <div key={item.id} className="border-b pb-4 last:border-0">
                  <div className="flex justify-between">
                    <div>
                      <p className="font-medium">
                        {item.quantity}x {item.menu_item?.name}
                      </p>
                      {item.modifiers?.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.modifiers.map((m) => m.name).join(", ")}
                        </p>
                      )}
                    </div>
                    <p className="font-medium">
                      RM{" "}
                      {(
                        (item.menu_item?.price || 0) +
                        item.modifiers.reduce((sum, m) => sum + m.price, 0)
                      ).toFixed(2)}
                    </p>
                  </div>
                  {item.special_instructions && (
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Special instructions:</strong> {item.special_instructions}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-4 font-semibold">
              <span>Subtotal</span>
              <span>RM {order.total_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Delivery Fee</span>
              <span>RM {order.delivery_fee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 text-lg font-bold">
              <span>Total</span>
              <span>RM {(order.total_amount + order.delivery_fee).toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Customer & Delivery Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>{order.customer_name || "Guest Customer"}</span>
              </div>
              {order.customer_phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="text-primary hover:underline"
                  >
                    {order.customer_phone}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery Address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                <span>{order.delivery_address}</span>
              </div>
            </CardContent>
          </Card>

          {order.driver_name && (
            <Card>
              <CardHeader>
                <CardTitle>Driver Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p>
                  <strong>Name:</strong> {order.driver_name}
                </p>
                {order.driver_phone && (
                  <p>
                    <strong>Phone:</strong>{" "}
                    <a href={`tel:${order.driver_phone}`} className="text-primary">
                      {order.driver_phone}
                    </a>
                  </p>
                )}
                {order.driver_plate_number && (
                  <p>
                    <strong>Plate:</strong> {order.driver_plate_number}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}