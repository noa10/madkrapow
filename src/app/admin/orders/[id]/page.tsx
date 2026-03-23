"use client";

import { useEffect, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { MapPin, Phone, User, ArrowLeft, Zap, Loader2 } from "lucide-react";
import Link from "next/link";
import { StatusTransitionButtons } from "@/components/admin/StatusTransitionButtons";
import { BulkOrderReview } from "@/components/admin/BulkOrderReview";

interface OrderItemModifier {
  id: string;
  modifier_name: string;
  modifier_price_delta_cents: number;
}

interface OrderItem {
  id: string;
  menu_item_name: string;
  menu_item_price_cents: number;
  quantity: number;
  line_total_cents: number;
  notes: string | null;
  order_item_modifiers: OrderItemModifier[];
}

interface Order {
  id: string;
  status: string;
  total_cents: number;
  delivery_fee_cents: number;
  created_at: string;
  delivery_address_json: Record<string, unknown> | null;
  customer_phone: string | null;
  customer_name: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  driver_plate_number: string | null;
  delivery_type: string;
  fulfillment_type: string;
  scheduled_for: string | null;
  dispatch_status: string | null;
  order_kind: string;
  approval_status: string;
  requires_manual_review: boolean;
  approved_total_cents: number | null;
  review_notes: string | null;
  bulk_company_name: string | null;
  bulk_headcount: number | null;
  bulk_requested_date: string | null;
  bulk_budget_cents: number | null;
  bulk_invoice_name: string | null;
  bulk_contact_phone: string | null;
  bulk_special_notes: string | null;
  bulk_dropoff_instructions: string | null;
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

function getAddressString(address: Record<string, unknown> | null): string {
  if (!address) return 'No address'
  const parts = [
    address.address_line1 as string,
    address.address_line2 as string,
    address.city as string,
    address.state as string,
    address.postal_code as string,
  ].filter(Boolean)
  return parts.join(', ') || 'No address'
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

function ReleaseNowButton({ orderId, onSuccess }: { orderId: string; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false)

  const handleRelease = async () => {
    setLoading(true)
    try {
      const supabase = getBrowserClient()
      const { error } = await supabase
        .from('orders')
        .update({ dispatch_status: 'submitted' })
        .eq('id', orderId)

      if (error) {
        console.error('Failed to release order:', error)
        return
      }
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button size="sm" onClick={handleRelease} disabled={loading} className="gap-1">
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Zap className="h-3 w-3" />
      )}
      Release Now
    </Button>
  )
}

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
        .select(`
          *,
          order_items (
            *,
            order_item_modifiers (*)
          )
        `)
        .eq("id", params.id)
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      setOrder(data as unknown as Order);
      setLoading(false);
    };

    fetchOrder();

    const channel = supabase
      .channel(`admin-order-${params.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${params.id}` },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          setOrder((prev) => prev ? { ...prev, ...payload.new } : null);
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
        <div className="ml-auto flex items-center gap-2">
          <Badge className={statusConfig.color}>
            {statusConfig.label}
          </Badge>
          {order.delivery_type === 'self_pickup' && (
            <Badge variant="outline">Pickup</Badge>
          )}
          {order.fulfillment_type === 'scheduled' && (
            <Badge variant="outline">Scheduled</Badge>
          )}
        </div>
      </div>

      {order.fulfillment_type === 'scheduled' && order.scheduled_for && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {order.delivery_type === 'self_pickup' ? 'Pickup' : 'Delivery'} scheduled for
                </p>
                <p className="font-semibold">
                  {format(new Date(order.scheduled_for), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {order.dispatch_status && (
                  <Badge variant={order.dispatch_status === 'failed' ? 'destructive' : 'secondary'}>
                    Dispatch: {order.dispatch_status}
                  </Badge>
                )}
                {order.dispatch_status === 'queued' && order.delivery_type === 'delivery' && (
                  <ReleaseNowButton orderId={order.id} onSuccess={() => {
                    setOrder(prev => prev ? { ...prev, dispatch_status: 'submitted' } : null)
                  }} />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <StatusTransitionButtons
        orderId={order.id}
        currentStatus={order.status}
        onStatusUpdate={(newStatus) => setOrder({ ...order, status: newStatus })}
      />

      {/* Bulk Order Review */}
      {order.order_kind === 'bulk' && (
        <BulkOrderReview
          orderId={order.id}
          approvalStatus={order.approval_status}
          subtotalCents={order.total_cents}
          bulkCompanyName={order.bulk_company_name}
          bulkHeadcount={order.bulk_headcount}
          bulkRequestedDate={order.bulk_requested_date}
          bulkBudgetCents={order.bulk_budget_cents}
          bulkInvoiceName={order.bulk_invoice_name}
          bulkContactPhone={order.bulk_contact_phone}
          bulkSpecialNotes={order.bulk_special_notes}
          bulkDropoffInstructions={order.bulk_dropoff_instructions}
          reviewNotes={order.review_notes}
          approvedTotalCents={order.approved_total_cents}
          onStatusUpdate={(status, approvedTotal, notes) => {
            setOrder(prev => prev ? {
              ...prev,
              approval_status: status,
              approved_total_cents: approvedTotal ?? prev.approved_total_cents,
              review_notes: notes ?? prev.review_notes,
            } : null)
          }}
        />
      )}

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
                        {item.quantity}x {item.menu_item_name}
                      </p>
                      {item.order_item_modifiers?.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.order_item_modifiers.map((m) => m.modifier_name).join(", ")}
                        </p>
                      )}
                    </div>
                    <p className="font-medium">
                      {formatPrice(item.line_total_cents)}
                    </p>
                  </div>
                  {item.notes && (
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Note:</strong> {item.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-4 font-semibold">
              <span>Subtotal</span>
              <span>{formatPrice(order.total_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery Fee</span>
              <span>{formatPrice(order.delivery_fee_cents)}</span>
            </div>
            <div className="flex justify-between pt-2 text-lg font-bold">
              <span>Total</span>
              <span>{formatPrice(order.total_cents + order.delivery_fee_cents)}</span>
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
              <CardTitle>
                {order.delivery_type === 'self_pickup' ? 'Pickup' : 'Delivery'} Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.delivery_type === 'self_pickup' ? (
                <p className="text-muted-foreground">Customer will pick up from store</p>
              ) : (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                  <span>{getAddressString(order.delivery_address_json)}</span>
                </div>
              )}
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
