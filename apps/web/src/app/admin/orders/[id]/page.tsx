"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { MapPin, Phone, User, ArrowLeft, Zap, Loader2, Clock, CheckCircle, Circle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { generateOrderDisplayCode } from "@/lib/utils/order-code";
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
  image_url: string | null;
  order_item_modifiers: OrderItemModifier[];
}

interface Order {
  id: string;
  status: string;
  total_cents: number;
  delivery_fee_cents: number;
  created_at: string;
  updated_at: string | null;
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
  accepted: { color: "bg-sky-100 text-sky-800", label: "Accepted" },
  preparing: { color: "bg-orange-100 text-orange-800", label: "Preparing" },
  ready: { color: "bg-green-100 text-green-800", label: "Ready" },
  picked_up: { color: "bg-indigo-100 text-indigo-800", label: "Picked Up" },
  delivered: { color: "bg-teal-100 text-teal-800", label: "Delivered" },
  completed: { color: "bg-teal-100 text-teal-800", label: "Completed" },
  cancelled: { color: "bg-red-100 text-red-800", label: "Cancelled" },
};

const ORDER_FLOW_STEPS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'picked_up', label: 'Picked Up' },
  { key: 'delivered', label: 'Delivered' },
];

const TERMINAL_STATUSES = ['delivered', 'completed', 'cancelled'];

function getFlowStepIndex(status: string): number {
  return ORDER_FLOW_STEPS.findIndex((s) => s.key === status);
}

interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

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

function ReleaseNowButton({
  orderId,
  shipment,
  onSuccess,
}: {
  orderId: string
  shipment: {
    quotation_id: string | null
    stop_ids?: { pickup: string; dropoff: string } | null
  } | null
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRelease = async () => {
    if (!shipment?.quotation_id) {
      setError('No quotation available. Please refresh the quote first.')
      return
    }
    if (!shipment.stop_ids?.pickup || !shipment.stop_ids?.dropoff) {
      setError('Missing delivery route information. Please refresh the quote.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/shipping/lalamove/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          quotation_id: shipment.quotation_id,
          sender_stop_id: shipment.stop_ids.pickup,
          recipient_stop_id: shipment.stop_ids.dropoff,
        }),
      })

      const result = await res.json()

      if (!result.success) {
        setError(result.error || 'Failed to dispatch order')
        return
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleRelease} disabled={loading} className="gap-1">
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Zap className="h-3 w-3" />
        )}
        Release Now
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [shipment, setShipment] = useState<{
    id: string
    lalamove_order_id: string | null
    dispatch_status: string
    share_link: string | null
    service_type: string
    driver_name: string | null
    driver_phone: string | null
    driver_plate: string | null
    driver_photo_url: string | null
    quoted_fee_cents: number | null
    actual_fee_cents: number | null
    created_at: string
    completed_at: string | null
    cancelled_at: string | null
    quotation_id: string | null
    stop_ids?: { pickup: string; dropoff: string } | null
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderEvents, setOrderEvents] = useState<OrderEvent[]>([]);

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
        .eq("id", orderId)
        .single();

      if (error) {
        setError(error.message);
        return;
      }

      setOrder(data as unknown as Order);

      // Fetch shipment data
      const { data: shipmentData } = await supabase
        .from('lalamove_shipments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (shipmentData) {
        setShipment(shipmentData);
      }

      // Fetch status history from order_events
      const { data: eventsData } = await supabase
        .from('order_events')
        .select('*')
        .eq('order_id', orderId)
        .eq('event_type', 'status_changed')
        .order('created_at', { ascending: true });

      if (eventsData) {
        setOrderEvents(eventsData as unknown as OrderEvent[]);
      }

      setLoading(false);
    };

    fetchOrder();

    const channel = supabase
      .channel(`admin-order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (payload: RealtimePostgresChangesPayload<Order>) => {
          setOrder((prev) => prev ? { ...prev, ...payload.new } : null);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lalamove_shipments", filter: `order_id=eq.${orderId}` },
        () => {
          // Refetch shipment on any change
          supabase
            .from('lalamove_shipments')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
            .then(({ data }: { data: typeof shipment }) => { if (data) setShipment(data) })
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

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
          <h1 className="text-2xl font-bold">{generateOrderDisplayCode(order.id)}</h1>
          <p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
            System ID: {order.id}
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

      {/* Order Status Flow */}
      {order.status !== 'cancelled' && (
        <Card>
          <CardHeader>
            <CardTitle>Order Status Flow</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Build map of status -> reached timestamp from real events
              const statusReachedAt = new Map<string, string>();
              for (const event of orderEvents) {
                const newStatus = (event.new_value as Record<string, string> | null)?.status;
                if (newStatus && event.created_at) {
                  statusReachedAt.set(newStatus, event.created_at);
                }
              }
              // Infer pending from order creation time if there are later events
              if (orderEvents.length > 0 && !statusReachedAt.has('pending')) {
                const earliestEvent = orderEvents[0];
                if (earliestEvent.created_at) {
                  statusReachedAt.set('pending', order.created_at);
                }
              }
              // Current status is always reached (even if no event yet)
              if (!statusReachedAt.has(order.status)) {
                statusReachedAt.set(order.status, order.updated_at ?? order.created_at);
              }

              const currentStepIndex = getFlowStepIndex(order.status);

              return (
                <div className="flex items-start justify-between gap-2">
                  {ORDER_FLOW_STEPS.map((step, index) => {
                    const isReached = statusReachedAt.has(step.key);
                    const isCurrent = currentStepIndex === index;
                    const isLast = index === ORDER_FLOW_STEPS.length - 1;
                    const reachedAt = statusReachedAt.get(step.key);
                    return (
                      <div key={step.key} className="flex items-center flex-1 min-w-0">
                        <div className="flex flex-col items-center flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                            isReached
                              ? 'bg-primary border-primary text-primary-foreground'
                              : isCurrent
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-muted text-muted-foreground'
                          }`}>
                            {isReached ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <span className="text-xs font-medium">{index + 1}</span>
                            )}
                          </div>
                          <p className={`text-xs font-medium mt-1.5 text-center ${
                            isCurrent ? 'text-primary' : isReached ? 'text-foreground' : 'text-muted-foreground'
                          }`}>
                            {step.label}
                          </p>
                          {reachedAt && (
                            <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                              {format(new Date(reachedAt), 'MMM d, h:mm a')}
                            </p>
                          )}
                        </div>
                        {!isLast && (
                          <div className={`h-0.5 flex-1 min-w-[16px] mx-1 mt-[-18px] ${
                            currentStepIndex > index ? 'bg-primary' : 'bg-border'
                          }`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
      {order.status === 'cancelled' && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4">
            <p className="font-medium text-red-700">This order has been cancelled.</p>
            {orderEvents.length > 0 && (
              <div className="mt-3 space-y-1">
                {orderEvents.map((event) => {
                  const oldStatus = (event.old_value as Record<string, string> | null)?.status;
                  const newStatus = (event.new_value as Record<string, string> | null)?.status;
                  return (
                    <p key={event.id} className="text-xs text-muted-foreground">
                      {oldStatus ? `${STATUS_CONFIG[oldStatus]?.label ?? oldStatus} → ` : ''}
                      {newStatus ? STATUS_CONFIG[newStatus]?.label ?? newStatus : ''}
                      {' '}at {format(new Date(event.created_at), 'MMM d, h:mm a')}
                    </p>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  <ReleaseNowButton
                    orderId={order.id}
                    shipment={shipment}
                    onSuccess={() => {
                      setOrder(prev => prev ? { ...prev, dispatch_status: 'submitted' } : null)
                    }}
                  />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {order.status === 'pending' && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-yellow-800">Awaiting payment confirmation</p>
              <p className="text-sm text-yellow-700">
                This order is pending Stripe payment. It will appear in the merchant app once the payment webhook confirms the transaction. If the customer has already paid, check the Stripe webhook endpoint configuration or try refreshing this page.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <StatusTransitionButtons
        orderId={order.id}
        currentStatus={order.status}
        onStatusUpdate={(newStatus) => setOrder(prev => prev ? { ...prev, status: newStatus } : null)}
      />

      {/* Bulk Order Review */}
      {order.order_kind === 'bulk' && (
        <BulkOrderReview
          orderId={order.id}
          approvalStatus={order.approval_status}
          subtotalCents={order.total_cents}
          bulkCompanyName={order.bulk_company_name}
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.menu_item_name}
                          width={48}
                          height={48}
                          sizes="48px"
                          className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {item.quantity}x
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">
                          {item.quantity}x {item.menu_item_name}
                        </p>
                        {item.order_item_modifiers?.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.order_item_modifiers.map((m) => (
                              <p key={m.id} className="text-sm text-muted-foreground flex items-center gap-1">
                                <span className="text-xs">+</span>
                                {m.modifier_name}
                                {m.modifier_price_delta_cents > 0 && (
                                  <span className="text-xs ml-1">+ {formatPrice(m.modifier_price_delta_cents)}</span>
                                )}
                              </p>
                            ))}
                          </div>
                        )}
                        {item.notes && (
                          <p className="text-sm text-muted-foreground mt-1">
                            <strong>Note:</strong> {item.notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="font-medium flex-shrink-0">
                      {formatPrice(item.line_total_cents)}
                    </p>
                  </div>
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

          {/* Shipment Details */}
          {shipment && (
            <Card>
              <CardHeader>
                <CardTitle>Shipment Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div><strong>Status:</strong> <Badge variant={
                  shipment.dispatch_status === 'delivered' ? 'default' :
                  shipment.dispatch_status === 'failed' || shipment.dispatch_status === 'cancelled' ? 'destructive' : 'secondary'
                }>{shipment.dispatch_status}</Badge></div>
                <p><strong>Service:</strong> {shipment.service_type}</p>
                {shipment.lalamove_order_id && (
                  <p><strong>Lalamove ID:</strong> {shipment.lalamove_order_id}</p>
                )}
                {shipment.quoted_fee_cents != null && (
                  <p><strong>Quoted Fee:</strong> {formatPrice(shipment.quoted_fee_cents)}</p>
                )}
                {shipment.actual_fee_cents != null && shipment.actual_fee_cents !== shipment.quoted_fee_cents && (
                  <p><strong>Actual Fee:</strong> {formatPrice(shipment.actual_fee_cents)}</p>
                )}
                {shipment.share_link && (
                  <p>
                    <a href={shipment.share_link} target="_blank" rel="noopener noreferrer" className="text-primary text-sm">
                      Track Delivery →
                    </a>
                  </p>
                )}
                {shipment.driver_name && (
                  <p><strong>Driver:</strong> {shipment.driver_name} {shipment.driver_plate ? `(${shipment.driver_plate})` : ''}</p>
                )}
                {shipment.driver_phone && (
                  <p>
                    <strong>Phone:</strong>{' '}
                    <a href={`tel:${shipment.driver_phone}`} className="text-primary">{shipment.driver_phone}</a>
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {(shipment?.driver_name || order.driver_name) && (
            <Card>
              <CardHeader>
                <CardTitle>Driver Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p>
                  <strong>Name:</strong> {shipment?.driver_name || order.driver_name}
                </p>
                {(shipment?.driver_phone || order.driver_phone) && (
                  <p>
                    <strong>Phone:</strong>{" "}
                    <a href={`tel:${shipment?.driver_phone || order.driver_phone}`} className="text-primary">
                      {shipment?.driver_phone || order.driver_phone}
                    </a>
                  </p>
                )}
                {(shipment?.driver_plate || order.driver_plate_number) && (
                  <p>
                    <strong>Plate:</strong> {shipment?.driver_plate || order.driver_plate_number}
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
