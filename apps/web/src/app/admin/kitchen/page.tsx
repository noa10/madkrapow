'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, User, MapPin, Loader2, Package, ShieldAlert, Globe, MessageCircle, MessageSquare, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { useAdminOrders, AdminOrder } from '@/hooks/useAdminOrders';
import { useRoleGuard } from '@/hooks/use-role-guard';
import { getOrderDisplayCode } from '@/lib/utils/order-code';

const ACTIVE_STATUSES = ['paid', 'accepted', 'preparing', 'ready'];

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  web: <Globe className="h-4 w-4" />,
  telegram: <MessageCircle className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4" />,
  mobile: <Smartphone className="h-4 w-4" />,
};

const SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  mobile: "Mobile",
};

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
  const { hasAccess, isLoading: isAccessLoading } = useRoleGuard(["admin", "manager", "kitchen"]);
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

  if (isAccessLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-xl md:text-2xl font-medium text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="max-w-md bg-card border-destructive/50 shadow-sm rounded-xl">
          <CardContent className="pt-6 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-destructive font-medium text-xl">Access Denied</p>
            <p className="text-muted-foreground mt-2">You don&apos;t have permission to view the kitchen display.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="max-w-md bg-card border-destructive/50 shadow-sm rounded-xl">
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
          <h1 className="text-3xl md:text-5xl font-bold text-foreground font-display">Kitchen Display</h1>
          <p className="text-lg md:text-xl text-muted-foreground mt-2 font-medium">
            {filteredOrders.length} active order{filteredOrders.length !== 1 ? 's' : ''}
          </p>
        </header>

        {filteredOrders.length === 0 ? (
          <Card className="rounded-xl border bg-card p-12 text-center shadow-sm">
            <CardContent>
              <Clock className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="mt-6 text-2xl md:text-3xl font-medium text-foreground font-display">No Active Orders</h3>
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
    <Card className="overflow-hidden hover:shadow-xl transition-all cursor-default border-2 border-border bg-card shadow-sm rounded-xl">
      <CardHeader className="pb-4 border-b border-border bg-secondary/30">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl md:text-2xl font-bold font-display text-foreground">
            {getOrderDisplayCode(order)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {order.source && SOURCE_ICONS[order.source] && (
              <Badge variant="outline" className="text-sm px-2 py-0.5 flex items-center gap-1">
                {SOURCE_ICONS[order.source]}
                <span className="hidden sm:inline">{SOURCE_LABELS[order.source]}</span>
              </Badge>
            )}
            <Badge className={`${statusConfig.color} text-base md:text-lg px-3 py-1 font-bold border-none`}>
              {statusConfig.label}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 text-base md:text-lg text-muted-foreground mt-1">
          <Clock className="h-5 w-5" />
          <span>{format(new Date(order.created_at), "h:mm a")}</span>
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6 bg-card">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg p-1.5 bg-primary/10 flex-shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="text-base md:text-lg">
              <div className="font-semibold text-foreground">{order.customer_name || "Guest Customer"}</div>
              {order.customer_phone && (
                <div className="text-muted-foreground font-medium">{order.customer_phone}</div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-lg p-1.5 bg-primary/10 flex-shrink-0">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
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
  preparing: { color: "bg-orange-500 text-white", label: "Preparing" },
  ready: { color: "bg-emerald-500 text-white", label: "Ready" },
  delivering: { color: "bg-indigo-500 text-white", label: "Delivering" },
  completed: { color: "bg-teal-500 text-white", label: "Completed" },
  cancelled: { color: "bg-destructive text-destructive-foreground", label: "Cancelled" },
};

// Kitchen-specific status transition buttons with larger size for visibility
interface KitchenStatusTransitionButtonsProps {
  orderId: string;
  currentStatus: string;
  onStatusUpdate?: (newStatus: string) => void;
}

const KITCHEN_STATUS_FLOW = [
  { status: "preparing", label: "Mark Ready", icon: Package, next: "ready" },
];

function KitchenStatusTransitionButtons({
  orderId,
  currentStatus,
  onStatusUpdate,
}: KitchenStatusTransitionButtonsProps) {
  const [loading, setLoading] = useState(false);

  const currentStep = KITCHEN_STATUS_FLOW.find((s) => s.status === currentStatus);
  const canTransition =
    currentStep && !["picked_up", "delivered", "cancelled"].includes(currentStatus);

  const handleTransition = async () => {
    if (!currentStep) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: currentStep.next }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to update status:', error);
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
      className="w-full gap-2 py-6 text-lg md:text-xl h-auto shadow-gold"
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