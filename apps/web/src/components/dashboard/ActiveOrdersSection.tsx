"use client"

import Link from "next/link"
import { Clock, Truck, CheckCircle, Package, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ActiveOrder {
  id: string
  status: string
  total_cents: number
  created_at: string
  delivery_type: string
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-400", bgColor: "bg-amber-500/10", label: "Pending", icon: Clock },
  paid: { color: "text-blue-400", bgColor: "bg-blue-500/10", label: "Paid", icon: CheckCircle },
  accepted: { color: "text-purple-400", bgColor: "bg-purple-500/10", label: "Accepted", icon: Package },
  preparing: { color: "text-sky-400", bgColor: "bg-sky-500/10", label: "Preparing", icon: Clock },
  ready: { color: "text-emerald-400", bgColor: "bg-emerald-500/10", label: "Ready", icon: CheckCircle },
  picked_up: { color: "text-orange-400", bgColor: "bg-orange-500/10", label: "On the Way", icon: Truck },
}

function formatPrice(amount: number): string {
  return `RM ${(amount / 100).toFixed(2)}`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

interface ActiveOrdersSectionProps {
  orders: ActiveOrder[]
}

export function ActiveOrdersSection({ orders }: ActiveOrdersSectionProps) {
  if (orders.length === 0) return null

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
          <Truck className="h-4 w-4 text-orange-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground font-heading tracking-wide">
            Active Orders
          </h2>
          <p className="text-xs text-muted-foreground">
            {orders.length} {orders.length === 1 ? "order" : "orders"} in progress
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {orders.map((order) => {
          const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
          const StatusIcon = statusConfig.icon

          return (
            <div
              key={order.id}
              className={cn(
                "group relative overflow-hidden rounded-xl border border-white/8 bg-card/60 p-4 backdrop-blur-sm transition-all duration-300 hover:border-gold/20 hover:bg-card",
                order.status === "pending" && "border-gold/20"
              )}
            >
              {order.status === "pending" && (
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
              )}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground tabular-nums">
                  #{order.id.slice(0, 8).toUpperCase()}
                </span>
                <div className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium", statusConfig.bgColor, statusConfig.color)}>
                  <StatusIcon className="h-3 w-3" />
                  {statusConfig.label}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                <span>{formatDate(order.created_at)}</span>
                <span className="text-foreground font-medium">{formatPrice(order.total_cents)}</span>
              </div>
              <Button asChild size="sm" className="w-full h-8 text-xs gap-1.5">
                <Link href={`/order/${order.id}`}>
                  Track Order
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
