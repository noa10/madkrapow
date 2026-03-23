'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, User, MapPin, Loader2, ChefHat, Package, Truck, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useAdminOrders, AdminOrder } from '@/hooks/useAdminOrders';
import { getBrowserClient } from '@/lib/supabase/client';

const ACTIVE_STATUSES = ['paid', 'accepted', 'preparing', 'ready'];

function getAddressString(address: Record<string, unknown>): string {
  const parts = [
    address.address_line1 as string,
    address.address_line2 as string,
    address.city as string,
    address.state as string,
  ].filter(Boolean)
  return parts.join(', ') || 'No address'
}

export default function KitchenDisplayPage() {
  const { orders, loading, error } = useAdminOrders();
  // Filter orders to show only active ones for the kitchen
  const filteredOrders = useMemo(() => {
    if (!loading && orders) {
      return orders.filter(order => 
        ACTIVE_STATUSES.includes(order.status)
      );
    }
    return [];
  }, [orders, loading]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-xl md:text-2xl font-medium text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="max-w-md bg-card border-destructive/50">
          <CardContent className="pt-6 text-center">
            <p className="text-destructive font-medium text-xl">Error loading orders: {error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 md:mb-8">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground font-heading">Kitchen Display</h1>
          <p className="text-lg md:text-xl text-muted-foreground mt-2 font-medium">
            {filteredOrders.length} active order{filteredOrders.length !== 1 ? 's' : ''}
          </p>
        </header>

        {filteredOrders.length === 0 ? (
          <Card className="text-center py-16 bg-card border-border">
            <CardContent>
              <div className="mx-auto h-20 w-20 rounded-full bg-secondary flex items-center justify-center">
                <Clock className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="mt-6 text-2xl md:text-3xl font-medium text-foreground">No Active Orders</h3>
              <p className="mt-2 text-lg text-muted-foreground">New orders will appear here automatically</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 gap-4 md:gap-6">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: AdminOrder;
}

function OrderCard({ order }: OrderCardProps) {
  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;

  return (
    <Card className="overflow-hidden hover:shadow-xl transition-all cursor-default border-2 border-border bg-card">
      <CardHeader className="pb-4 border-b border-border bg-secondary/30">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl md:text-2xl font-bold font-heading text-foreground">
            #{order.id.slice(0, 8)}
          </CardTitle>
          <Badge className={`${statusConfig.color} text-base md:text-lg px-3 py-1 font-bold border-none`}>
            {statusConfig.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-base md:text-lg text-muted-foreground mt-1">
          <Clock className="h-5 w-5" />
          <span>{format(new Date(order.created_at), "h:mm a")}</span>
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6 bg-card">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
            <div className="text-base md:text-lg">
              <div className="font-semibold text-foreground">{order.customer_name || "Guest Customer"}</div>
              {order.customer_phone && (
                <div className="text-muted-foreground font-medium">{order.customer_phone}</div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
            <div className="text-base md:text-lg">
              <div className="font-semibold text-foreground">Delivery Address</div>
              <div className="text-muted-foreground break-words">{order.delivery_address_json ? getAddressString(order.delivery_address_json as Record<string, unknown>) : 'No address'}</div>
            </div>
          </div>

          <div className="pt-3">
            <div className="text-2xl md:text-3xl font-bold text-center py-3 bg-secondary rounded-lg text-foreground border border-border">
              RM {((order.total_cents + order.delivery_fee_cents) / 100).toFixed(0)}
            </div>
          </div>

          <div className="pt-4">
            <KitchenStatusTransitionButtons
              orderId={order.id}
              currentStatus={order.status}
              onStatusUpdate={() => {
                // The parent component will handle the update through the hook
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  pending: { color: "bg-amber-500/20 text-amber-500 border border-amber-500/50", label: "Pending" },
  paid: { color: "bg-sky-500 text-white", label: "Paid" },
  accepted: { color: "bg-violet-500 text-white", label: "Accepted" },
  preparing: { color: "bg-orange-500 text-white", label: "Preparing" },
  ready: { color: "bg-emerald-500 text-white", label: "Ready" },
  picked_up: { color: "bg-indigo-500 text-white", label: "Picked Up" },
  delivered: { color: "bg-teal-500 text-white", label: "Delivered" },
  cancelled: { color: "bg-destructive text-destructive-foreground", label: "Cancelled" },
};

// Kitchen-specific status transition buttons with larger size for visibility
interface KitchenStatusTransitionButtonsProps {
  orderId: string;
  currentStatus: string;
  onStatusUpdate?: (newStatus: string) => void;
}

const KITCHEN_STATUS_FLOW = [
  { status: "paid", label: "Accept Order", icon: Check, next: "accepted" },
  { status: "accepted", label: "Start Preparing", icon: ChefHat, next: "preparing" },
  { status: "preparing", label: "Mark Ready", icon: Package, next: "ready" },
  { status: "ready", label: "Hand to Driver", icon: Truck, next: "picked_up" },
];

function KitchenStatusTransitionButtons({
  orderId,
  currentStatus,
  onStatusUpdate,
}: KitchenStatusTransitionButtonsProps) {
  const [loading, setLoading] = useState(false);
  const supabase = getBrowserClient();

  const currentStep = KITCHEN_STATUS_FLOW.find((s) => s.status === currentStatus);
  const canTransition =
    currentStep && !["picked_up", "delivered", "cancelled"].includes(currentStatus);

  const handleTransition = async () => {
    if (!currentStep) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: currentStep.next })
        .eq("id", orderId);

      if (error) {
        console.error("Failed to update status:", error);
        return;
      }

      if (onStatusUpdate) {
        onStatusUpdate(currentStep.next);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!canTransition) {
    return null;
  }

  const Icon = currentStep.icon;

  return (
    <Button 
      onClick={handleTransition} 
      disabled={loading} 
      className="w-full gap-2 py-6 text-lg md:text-xl h-auto"
    >
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin" />
      ) : (
        <Icon className="h-6 w-6" />
      )}
      <span className="font-bold">{currentStep.label}</span>
    </Button>
  );
}