"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { MapPin, User, Clock } from "lucide-react";
import Link from "next/link";
import { AdminOrder } from "@/hooks/useAdminOrders";
import { getOrderDisplayCode } from "@/lib/utils/order-code";

interface OrderTicketProps {
  order: AdminOrder;
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

export function OrderTicket({ order }: OrderTicketProps) {
  const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;

  return (
    <Link href={`/admin/orders/${order.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-foreground tabular-nums tracking-wide">
              {getOrderDisplayCode(order)}
            </span>
            <Badge className={statusConfig.color}>
              {statusConfig.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(order.created_at), "h:mm a")}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{order.customer_name || "Guest"}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{getAddressString(order.delivery_address_json)}</span>
            </div>
            <div className="pt-2 font-semibold">
              RM {((order.total_cents + order.delivery_fee_cents) / 100).toFixed(2)}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
