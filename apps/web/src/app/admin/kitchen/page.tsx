'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Loader2, ShieldAlert } from 'lucide-react';
import { useAdminOrders } from '@/hooks/useAdminOrders';
import { useRoleGuard } from '@/hooks/use-role-guard';
import { ACTIVE_STATUSES } from './utils/order-status';
import { useKitchenOrderItems } from './hooks/useKitchenOrderItems';
import { KitchenOrderCard } from './KitchenOrderCard';

export default function KitchenDisplayPage() {
  const { hasAccess, isLoading: isAccessLoading } = useRoleGuard([
    'admin',
    'manager',
    'kitchen',
  ]);
  const { orders, loading, error } = useAdminOrders();

  // Filter orders to show only active ones for the kitchen
  const filteredOrders = useMemo(() => {
    if (!loading && orders) {
      return orders.filter((order) => ACTIVE_STATUSES.includes(order.status));
    }
    return [];
  }, [orders, loading]);

  // Only the active tickets need their items — no point fetching the board's
  // history. The hook keys on the id set, so realtime order churn is cheap.
  const activeOrderIds = useMemo(
    () => filteredOrders.map((order) => order.id),
    [filteredOrders]
  );
  const { itemsByOrderId, error: itemsError, loading: itemsLoading } =
    useKitchenOrderItems(activeOrderIds);

  if (isAccessLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-xl md:text-2xl font-medium text-muted-foreground">
            Loading orders...
          </p>
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
            <p className="text-destructive font-medium text-xl">
              Access Denied
            </p>
            <p className="text-muted-foreground mt-2">
              You don&apos;t have permission to view the kitchen display.
            </p>
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
            <p className="text-destructive font-medium text-xl">
              Error loading orders: {error}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6 md:mb-8">
          <h1 className="text-3xl md:text-5xl font-bold text-foreground font-display">
            Kitchen Display
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mt-2 font-medium">
            {filteredOrders.length} active order
            {filteredOrders.length !== 1 ? 's' : ''}
          </p>
        </header>

        {filteredOrders.length === 0 ? (
          <Card className="rounded-xl border bg-card p-12 text-center shadow-sm">
            <CardContent>
              <Clock className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="mt-6 text-2xl md:text-3xl font-medium text-foreground font-display">
                No Active Orders
              </h3>
              <p className="mt-2 text-lg text-muted-foreground">
                New orders will appear here automatically
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2 gap-4 md:gap-6">
            {filteredOrders.map((order) => (
              <KitchenOrderCard
                key={order.id}
                order={order}
                items={itemsByOrderId[order.id] ?? []}
                itemsUnavailable={Boolean(itemsError)}
                itemsLoading={itemsLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
