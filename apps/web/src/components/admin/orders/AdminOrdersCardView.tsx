"use client"

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { format, parseISO } from "date-fns"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { CompactOrderActions } from "./CompactOrderActions"
import type { Order } from "@/types/orders"

export interface OrdersByDateGroup {
  dateLabel: string
  dateKey: string
  orders: Order[]
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paid: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  accepted: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  preparing: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  ready: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  picked_up: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  delivered: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
}

function formatPrice(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`
}

function groupOrdersByDate(orders: Order[]): OrdersByDateGroup[] {
  const map = new Map<string, Order[]>()
  for (const order of orders) {
    const key = format(parseISO(order.created_at), "yyyy-MM-dd")
    const existing = map.get(key)
    if (existing) {
      existing.push(order)
    } else {
      map.set(key, [order])
    }
  }
  const sortedKeys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a))
  return sortedKeys.map((key) => ({
    dateKey: key,
    dateLabel: format(parseISO(key), "MMMM d, yyyy"),
    orders: map.get(key) || [],
  }))
}

interface AdminOrdersCardViewProps {
  orders: Order[]
  grouped?: boolean
  onStatusChange?: (newStatus: string) => void
}

export function AdminOrdersCardView({ orders, grouped = true, onStatusChange }: AdminOrdersCardViewProps) {
  if (orders.length === 0) return null

  const groups = grouped ? groupOrdersByDate(orders) : [{ dateKey: "all", dateLabel: "", orders }]

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.dateKey}>
          {/* Date header — hidden when not grouped */}
          {grouped && (
            <div className="sticky top-0 z-10 mb-3 flex items-center gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                {group.dateLabel}
              </h3>
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {group.orders.length} {group.orders.length === 1 ? "order" : "orders"}
              </span>
            </div>
          )}

          {/* Cards grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.orders.map((order, i) => (
              <div
                key={order.id}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-white/8 bg-card/60 p-4 backdrop-blur-sm transition-all duration-300 hover:border-gold/20 hover:bg-card",
                  `card-stagger-${Math.min(i + 1, 6)}`,
                  "animate-fade-in-up"
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="text-sm font-semibold text-gold hover:text-gold/80 tabular-nums"
                  >
                    #{order.id.slice(0, 8).toUpperCase()}
                  </Link>
                  <div className={cn("rounded-full px-2.5 py-1 text-[11px] font-medium border", STATUS_COLORS[order.status] || STATUS_COLORS.pending)}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </div>
                </div>

                {/* Customer */}
                <div className="text-xs text-muted-foreground mb-1">
                  {order.customer_name || "Guest"}
                </div>

                {/* Date */}
                <div className="text-[11px] text-muted-foreground/60 mb-3 tabular-nums">
                  {format(new Date(order.created_at), "MMM d, yyyy h:mm a")}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {order.delivery_type === "self_pickup" && (
                    <Badge variant="outline" className="text-[10px] h-5">Pickup</Badge>
                  )}
                  {order.fulfillment_type === "scheduled" && (
                    <Badge variant="outline" className="text-[10px] h-5">Scheduled</Badge>
                  )}
                  {order.order_kind === "bulk" && (
                    <Badge variant="outline" className="text-[10px] h-5 bg-purple-500/10 border-purple-500/30 text-purple-400">
                      Bulk
                    </Badge>
                  )}
                  {order.dispatch_status === "failed" && (
                    <Badge variant="destructive" className="text-[10px] h-5">Dispatch Failed</Badge>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <span className="text-sm font-semibold text-foreground">
                    {formatPrice(order.total_cents + order.delivery_fee_cents)}
                  </span>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition-colors"
                  >
                    Details
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                {/* Actions */}
                <CompactOrderActions
                  orderId={order.id}
                  currentStatus={order.status}
                  createdAt={order.created_at}
                  onStatusChange={onStatusChange}
                  variant="card"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
