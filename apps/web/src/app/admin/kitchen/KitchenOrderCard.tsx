'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock,
  User,
  MapPin,
  Loader2,
  Package,
  Flame,
  Printer,
  Globe,
  MessageCircle,
  MessageSquare,
  Smartphone,
  Store,
  Bike,
  UtensilsCrossed,
  Utensils,
  PlusCircle,
  StickyNote,
} from 'lucide-react';
import { format } from 'date-fns';
import type { AdminOrder } from '@/hooks/useAdminOrders';
import { useToastStore } from '@/stores/toast';
import { isPrintBridgeConfigured, printViaBridge } from '@/lib/printing/client';
import { getOrderDisplayCode } from '@/lib/utils/order-code';
import { formatMoney, orderTotalCents } from '@/lib/orders/money';
import { statusConfigFor } from './utils/order-status';
import { formatElapsed, ticketAge, type TicketAge } from './utils/ticket-age';
import type { KitchenItem } from './hooks/useKitchenOrderItems';

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  web: <Globe className="h-4 w-4" />,
  telegram: <MessageCircle className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4" />,
  mobile: <Smartphone className="h-4 w-4" />,
  counter: <Store className="h-4 w-4" />,
  grabfood: <Bike className="h-4 w-4" />,
  foodpanda: <UtensilsCrossed className="h-4 w-4" />,
};

const SOURCE_LABELS: Record<string, string> = {
  web: 'Web',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  mobile: 'Mobile',
  counter: 'Counter',
  grabfood: 'GrabFood',
  foodpanda: 'Foodpanda',
};

/** Tint for the elapsed label, so a ticket going stale is visible at a glance. */
const AGE_CLASS: Record<TicketAge, string> = {
  fresh: 'text-muted-foreground',
  aging: 'text-amber-500',
  overdue: 'text-destructive',
};

function getAddressString(address: Record<string, unknown>): string {
  const parts = [
    address.address_line1 as string,
    address.address_line2 as string,
    address.city as string,
    address.state as string,
  ].filter(Boolean);
  return parts.join(', ') || 'No address';
}

interface KitchenOrderCardProps {
  order: AdminOrder;
  items: KitchenItem[];
  /** Items failed to load — say so rather than implying the order is empty. */
  itemsUnavailable?: boolean;
  /** First items fetch for this board is still in flight. */
  itemsLoading?: boolean;
  /** Injectable clock so the elapsed label is deterministic in tests. */
  now?: Date;
}

/**
 * A kitchen ticket: what to cook, for whom, and how long it has been waiting.
 *
 * Mirrors the merchant app's `KitchenOrderCard` — same order of information and
 * the same wording, so the two displays read identically. Prices are absent
 * apart from the order total: the kitchen reads quantities, items, addons and
 * notes, not money.
 */
export function KitchenOrderCard({
  order,
  items,
  itemsUnavailable = false,
  itemsLoading = false,
  now,
}: KitchenOrderCardProps) {
  const statusConfig = statusConfigFor(order.status);
  const currentTime = now ?? new Date();
  const note = order.notes?.trim();
  const dishCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const isDelivery = order.delivery_type === 'delivery';
  const isDineIn = order.delivery_type === 'dine_in';
  const isUnpaid = order.status === 'pending';

  return (
    <Card className="overflow-hidden hover:shadow-xl transition-all cursor-default border-2 border-border bg-card shadow-sm rounded-xl">
      <CardHeader className="pb-4 border-b border-border bg-secondary/30">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl md:text-2xl font-bold font-display text-foreground">
            {getOrderDisplayCode(order)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {order.source && SOURCE_ICONS[order.source] && (
              <Badge
                variant="outline"
                className="text-sm px-2 py-0.5 flex items-center gap-1"
              >
                {SOURCE_ICONS[order.source]}
                <span className="hidden sm:inline">
                  {SOURCE_LABELS[order.source]}
                </span>
              </Badge>
            )}
            <Badge
              className={`${statusConfig.color} text-base md:text-lg px-3 py-1 font-bold border-none`}
            >
              {statusConfig.label}
            </Badge>
            {isUnpaid && (
              <Badge className="border-none bg-amber-500 text-black text-base md:text-lg px-3 py-1 font-bold">
                Unpaid
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-base md:text-lg mt-1">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground">
            {format(new Date(order.created_at), 'h:mm a')}
          </span>
          <span
            className={`font-bold ${AGE_CLASS[ticketAge(order.created_at, currentTime)]}`}
          >
            {formatElapsed(order.created_at, currentTime)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-5 md:p-6 bg-card">
        <div className="space-y-4">
          {isDineIn && (
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-1.5 bg-primary/10 flex-shrink-0">
                <UtensilsCrossed className="h-4 w-4 text-primary" />
              </div>
              <div className="text-base md:text-lg">
                <div className="font-semibold text-foreground">
                  Table {order.table_label ?? '—'}
                </div>
                <div className="text-muted-foreground font-medium">
                  {order.pax ?? '—'} pax
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="rounded-lg p-1.5 bg-primary/10 flex-shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div className="text-base md:text-lg">
              <div className="font-semibold text-foreground">
                {order.customer_name || 'Guest Customer'}
              </div>
              {order.customer_phone?.trim() && (
                <div className="text-muted-foreground font-medium">
                  {order.customer_phone.trim()}
                </div>
              )}
            </div>
          </div>

          {isDelivery && (
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-1.5 bg-primary/10 flex-shrink-0">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div className="text-base md:text-lg">
                <div className="font-semibold text-foreground">
                  Delivery Address
                </div>
                <div className="text-muted-foreground break-words">
                  {order.delivery_address_json
                    ? getAddressString(
                        order.delivery_address_json as Record<string, unknown>
                      )
                    : 'No address'}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-border" />

          <div>
            {items.length === 0 ? (
              <p className="text-base italic text-muted-foreground">
                {itemsLoading
                  ? 'Loading items…'
                  : itemsUnavailable
                    ? 'Items unavailable'
                    : 'No items recorded'}
              </p>
            ) : (
              <>
                <div className="text-sm font-bold tracking-wide text-muted-foreground">
                  ITEMS ({dishCount})
                </div>
                <ul className="mt-2 space-y-3">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-start gap-3">
                      <span className="rounded bg-primary/15 px-2 py-0.5 text-sm font-bold text-primary">
                        {item.quantity}x
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-semibold text-foreground">
                          {item.name}
                        </div>
                        {item.modifiers.map((modifier, index) => (
                          <div
                            key={`${item.id}-mod-${index}`}
                            className="mt-0.5 flex items-start gap-1.5 text-base text-muted-foreground"
                          >
                            <PlusCircle className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
                            <span>{modifier}</span>
                          </div>
                        ))}
                        {item.notes?.trim() && (
                          <div className="mt-1 flex items-start gap-1.5 text-base italic text-muted-foreground">
                            <StickyNote className="mt-1 h-3.5 w-3.5 shrink-0" />
                            <span>Note: {item.notes.trim()}</span>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {note && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
              <div className="text-xs font-bold tracking-wide text-amber-500">
                ORDER NOTE
              </div>
              <div className="mt-0.5 text-base font-semibold text-foreground">
                {note}
              </div>
            </div>
          )}

          {order.include_cutlery && (
            <div className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Utensils className="h-5 w-5 text-primary" />
              <span>Cutlery requested</span>
            </div>
          )}

          <div className="rounded-lg border border-border bg-secondary py-3 text-center text-2xl md:text-3xl font-bold text-foreground">
            {formatMoney(orderTotalCents(order))}
          </div>

          <div className="pt-4 flex gap-2 items-stretch">
            <KitchenPrintButton orderId={order.id} source={order.source} />
            <KitchenStatusTransitionButtons
              orderId={order.id}
              currentStatus={order.status}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Kitchen-specific print button: reprints the docket/ticket via the LAN print
// bridge (Hubbo's REPRINT pattern). Hidden when no bridge is configured.
interface KitchenPrintButtonProps {
  orderId: string;
  source?: string;
}

function KitchenPrintButton({ orderId, source }: KitchenPrintButtonProps) {
  const { addToast } = useToastStore();
  const [printing, setPrinting] = useState(false);

  if (!isPrintBridgeConfigured()) {
    return null;
  }

  const type: 'kitchen_docket' | 'grabfood_ticket' =
    source === 'grabfood' ? 'grabfood_ticket' : 'kitchen_docket';

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const result = await printViaBridge(orderId, type);
      if (!result.ok) {
        addToast({
          type: 'error',
          title: 'Print failed',
          description: result.error,
        });
      } else {
        addToast({ type: 'success', title: 'Sent to printer' });
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="lg"
      className="flex-1 text-base md:text-lg font-semibold"
      onClick={handlePrint}
      disabled={printing}
    >
      {printing ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Printer className="h-5 w-5 mr-1" />
      )}
      Print
    </Button>
  );
}

// Kitchen-specific status transition buttons with larger size for visibility
interface KitchenStatusTransitionButtonsProps {
  orderId: string;
  currentStatus: string;
}

const KITCHEN_STATUS_FLOW = [
  { status: 'paid', label: 'Start Preparing', icon: Flame, next: 'preparing' },
  { status: 'preparing', label: 'Mark Ready', icon: Package, next: 'ready' },
];

function KitchenStatusTransitionButtons({
  orderId,
  currentStatus,
}: KitchenStatusTransitionButtonsProps) {
  const [loading, setLoading] = useState(false);

  const currentStep = KITCHEN_STATUS_FLOW.find(
    (s) => s.status === currentStatus
  );
  const canTransition =
    currentStep &&
    !['picked_up', 'delivered', 'cancelled'].includes(currentStatus);

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
