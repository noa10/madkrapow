"use client"

import Link from "next/link"
import { ShoppingBag, Clock, Truck, CheckCircle, Package, ArrowRight, Loader2 } from "lucide-react"
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
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string; icon: typeof Clock }> = {
  pending: { color: "text-amber-400", bgColor: "bg-amber-500/10", label: "Pending", icon: Clock },
  paid: { color: "text-blue-400", bgColor: "bg-blue-500/10", label: "Paid", icon: CheckCircle },
  accepted: { color: "text-purple-400", bgColor: "bg-purple-500/10", label: "Accepted", icon: Package },
  preparing: { color: "text-sky-400", bgColor: "bg-sky-500/10", label: "Preparing", icon: Clock },
  ready: { color: "text-emerald-400", bgColor: "bg-emerald-500/10", label: "Ready", icon: CheckCircle },
  picked_up: { color: "text-orange-400", bgColor: "bg-orange-500/10", label: "On the Way", icon: Truck },
  delivered: { color: "text-emerald-400", bgColor: "bg-emerald-500/10", label: "Delivered", icon: CheckCircle },
  cancelled: { color: "text-red-400", bgColor: "bg-red-500/10", label: "Cancelled", icon: Clock },
}

function formatPrice(amount: number): string {
  return `RM ${(amount / 100).toFixed(2)}`
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

interface RecentOrdersSectionProps {
  orders: Order[]
  onReorder: (orderId: string) => void
  reorderingId: string | null
  onViewAll?: () => void
  maxItems?: number
}

export function RecentOrdersSection({ orders, onReorder, reorderingId, onViewAll, maxItems = 6 }: RecentOrdersSectionProps) {
  const recentOrders = orders.slice(0, maxItems)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
            <ShoppingBag className="h-4 w-4 text-purple-400" />
          </div>
          <h2 className="text-base font-semibold text-foreground font-heading tracking-wide">
            Recent Orders
          </h2>
        </div>
        {orders.length > maxItems && onViewAll && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-gold" onClick={onViewAll}>
            View All
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      {recentOrders.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-card/60 p-8 text-center backdrop-blur-sm">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No past orders yet</p>
          <Button asChild>
            <Link href="/">Browse Menu</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {recentOrders.map((order, i) => {
            const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
            const StatusIcon = statusConfig.icon

            return (
              <div
                key={order.id}
                className={cn(
                  "group rounded-xl border border-white/8 bg-card/60 p-4 backdrop-blur-sm transition-all duration-300 hover:border-gold/20 hover:bg-card",
                  `card-stagger-${Math.min(i + 1, 6)}`,
                  "animate-fade-in-up"
                )}
              >
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
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => onReorder(order.id)}
                    disabled={reorderingId === order.id}
                  >
                    {reorderingId === order.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Reorder"
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    asChild
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
      )}
    </section>
  )
}
