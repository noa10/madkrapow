"use client"

import Link from "next/link"
import { Clock, Truck, CheckCircle, Package, ArrowRight, Calendar, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Order {
  id: string
  status: string
  total_cents: number
  created_at: string
  delivery_type: string
  include_cutlery: boolean
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-400", label: "Pending", icon: Clock },
  paid: { color: "text-sky-400", label: "Paid", icon: Package },
  accepted: { color: "text-purple-400", label: "Accepted", icon: Package },
  preparing: { color: "text-blue-400", label: "Preparing", icon: Clock },
  ready: { color: "text-emerald-400", label: "Ready", icon: CheckCircle },
  picked_up: { color: "text-orange-400", label: "On the Way", icon: Truck },
  delivered: { color: "text-emerald-400", label: "Delivered", icon: CheckCircle },
  cancelled: { color: "text-red-400", label: "Cancelled", icon: Package },
}

function formatPrice(amount: number) {
  return `RM ${(amount / 100).toFixed(2)}`
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

interface OrdersListViewProps {
  orders: Order[]
}

export function OrdersListView({ orders }: OrdersListViewProps) {
  if (orders.length === 0) return null

  return (
    <div className="divide-y divide-white/5 rounded-xl border border-white/8 overflow-hidden bg-card/60 backdrop-blur-sm">
      {orders.map((order, i) => {
        const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
        const StatusIcon = statusConfig.icon

        return (
          <div
            key={order.id}
            className={cn(
              "flex items-center justify-between gap-4 p-3 sm:p-4 transition-colors hover:bg-white/[0.03]",
              `card-stagger-${Math.min(i + 1, 6)}`,
              "animate-fade-in-up"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-medium text-foreground tabular-nums shrink-0">
                #{order.id.slice(0, 8).toUpperCase()}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                <Calendar className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{formatDate(order.created_at)}</span>
              </div>
              <div className={cn("inline-flex items-center gap-1.5 text-xs font-medium shrink-0", statusConfig.color)}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
              </div>
              {order.delivery_type === "self_pickup" && (
                <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-400 hidden sm:inline">
                  Pickup
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5 text-sm">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-foreground">{formatPrice(order.total_cents)}</span>
              </div>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-gold"
              >
                <Link href={`/order/${order.id}`}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
