"use client"

import Link from "next/link"
import { Package, Clock, Truck, CheckCircle, Calendar, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: Record<string, unknown> | null
  delivery_type: string
  include_cutlery: boolean
}

const STATUS_CONFIG: Record<string, { color: string; label: string; icon: typeof Clock }> = {
  pending: { color: "bg-amber-500/10 text-amber-400", label: "Pending", icon: Clock },
  paid: { color: "bg-sky-500/10 text-sky-400", label: "Paid", icon: CheckCircle },
  accepted: { color: "bg-purple-500/10 text-purple-400", label: "Accepted", icon: Package },
  preparing: { color: "bg-blue-500/10 text-blue-400", label: "Preparing", icon: Clock },
  ready: { color: "bg-emerald-500/10 text-emerald-400", label: "Ready", icon: CheckCircle },
  picked_up: { color: "bg-orange-500/10 text-orange-400", label: "On the Way", icon: Truck },
  delivered: { color: "bg-emerald-500/10 text-emerald-400", label: "Delivered", icon: CheckCircle },
  cancelled: { color: "bg-red-500/10 text-red-400", label: "Cancelled", icon: Package },
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
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface OrdersCardViewProps {
  orders: Order[]
}

export function OrdersCardView({ orders }: OrdersCardViewProps) {
  if (orders.length === 0) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {orders.map((order, i) => {
        const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
        const StatusIcon = statusConfig.icon

        return (
          <div
            key={order.id}
            className={cn(
              "group relative overflow-hidden rounded-xl border border-white/8 bg-card/60 backdrop-blur-sm transition-all duration-300 hover:border-gold/20 hover:bg-card",
              `card-stagger-${Math.min(i + 1, 6)}`,
              "animate-fade-in-up"
            )}
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground tabular-nums">
                  #{order.id.slice(0, 8).toUpperCase()}
                </span>
                <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", statusConfig.color)}>
                  <StatusIcon className="h-3 w-3" />
                  {statusConfig.label}
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDate(order.created_at)}</span>
                  </div>
                  <span className="text-foreground font-medium">{formatPrice(order.total_cents)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {order.delivery_type === "self_pickup" && (
                    <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-400">
                      Pickup
                    </span>
                  )}
                  {order.delivery_type === "delivery" && (
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400">
                      Delivery
                    </span>
                  )}
                </div>
              </div>

              {/* Action */}
              <Button asChild size="sm" className="w-full h-8 text-xs gap-1.5">
                <Link href={`/order/${order.id}`}>
                  Track Order
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
