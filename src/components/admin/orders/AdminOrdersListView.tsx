"use client"

import Link from "next/link"
import { ExternalLink, User, Calendar, DollarSign } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  customer_name: string | null
  customer_phone: string | null
  delivery_type: string
  fulfillment_type: string
  dispatch_status: string | null
  order_kind: string
  approval_status: string
  bulk_company_name: string | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-amber-400",
  paid: "text-sky-400",
  accepted: "text-violet-400",
  preparing: "text-orange-400",
  ready: "text-emerald-400",
  picked_up: "text-indigo-400",
  delivered: "text-teal-400",
  cancelled: "text-red-400",
}

function formatPrice(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`
}

interface AdminOrdersListViewProps {
  orders: Order[]
}

export function AdminOrdersListView({ orders }: AdminOrdersListViewProps) {
  if (orders.length === 0) return null

  return (
    <div className="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden bg-card/60 backdrop-blur-sm">
      {orders.map((order, i) => (
        <div
          key={order.id}
          className={cn(
            "flex items-center justify-between gap-4 p-3 sm:p-4 transition-colors hover:bg-white/[0.03]",
            `card-stagger-${Math.min(i + 1, 6)}`,
            "animate-fade-in-up"
          )}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Link
              href={`/admin/orders/${order.id}`}
              className="text-sm font-medium text-gold hover:text-gold/80 tabular-nums shrink-0"
            >
              #{order.id.slice(0, 8).toUpperCase()}
            </Link>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 min-w-0">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{order.customer_name || "Guest"}</span>
            </div>
            <span className={cn("text-xs font-medium shrink-0 hidden sm:inline", STATUS_COLORS[order.status] || STATUS_COLORS.pending)}>
              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
            </span>
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground/60 shrink-0">
              <Calendar className="h-3 w-3" />
              <span className="tabular-nums">{format(new Date(order.created_at), "MMM d")}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-1 text-sm tabular-nums">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-foreground">{formatPrice(order.total_cents + order.delivery_fee_cents)}</span>
            </div>
            <Link
              href={`/admin/orders/${order.id}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-gold transition-colors"
            >
              <span className="hidden lg:inline">View</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
