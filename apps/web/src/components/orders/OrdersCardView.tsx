"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { Clock, Truck, CheckCircle, Package, Calendar, ShoppingCart, Loader2 } from "lucide-react"
import { generateOrderDisplayCode } from "@/lib/utils/order-code"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCartStore } from "@/stores/cart"

interface Order {
  id: string
  status: string
  total_cents: number
  created_at: string
  delivery_type: string
  include_cutlery: boolean
  item_count: number
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
  const router = useRouter()
  const addItem = useCartStore((s) => s.addItem)
  const [reorderingId, setReorderingId] = useState<string | null>(null)

  const handleReorder = useCallback(async (orderId: string) => {
    setReorderingId(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}/items`)
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      for (const item of data.orderItems) {
        addItem({
          menu_item_id: item.menu_item_id,
          quantity: item.quantity,
          unit_price: item.menu_item_price_cents,
          selected_modifiers: (item.modifiers || []).map((m: { id: string; modifier_name: string; modifier_price_delta_cents: number }) => ({
            id: m.id,
            name: m.modifier_name,
            price_delta_cents: m.modifier_price_delta_cents,
          })),
          special_instructions: item.notes || "",
        })
      }
      router.push("/cart")
    } catch (e) {
      console.error("Reorder failed:", e)
    } finally {
      setReorderingId(null)
    }
  }, [addItem, router])

  if (orders.length === 0) return null

  return (
    <div className="space-y-3">
      {orders.map((order, i) => {
        const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending
        const StatusIcon = statusConfig.icon
        const isReordering = reorderingId === order.id

        return (
          <div
            key={order.id}
            onClick={() => router.push(`/order/${order.id}`)}
            className={cn(
              "flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-card/60 backdrop-blur-sm p-4 transition-all duration-200 hover:border-gold/20 hover:bg-card cursor-pointer",
              `card-stagger-${Math.min(i + 1, 6)}`,
              "animate-fade-in-up"
            )}
          >
            {/* Left: order code + status + date */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
              <span className="text-base font-bold text-foreground tabular-nums tracking-wide shrink-0">
                {generateOrderDisplayCode(order.id)}
              </span>
              <div className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium shrink-0", statusConfig.color)}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span className="hidden sm:inline">{formatDate(order.created_at)}</span>
                <span className="sm:hidden">{new Date(order.created_at).toLocaleDateString("en-MY")}</span>
              </div>
            </div>

            {/* Middle: items + type + total */}
            <div className="hidden md:flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {order.item_count} {order.item_count === 1 ? "item" : "items"}
              </span>
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
              <span className="text-sm font-medium text-foreground tabular-nums">
                {formatPrice(order.total_cents)}
              </span>
            </div>

            {/* Right: buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-medium text-foreground tabular-nums md:hidden">
                {formatPrice(order.total_cents)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-gold"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/order/${order.id}`)
                }}
              >
                <Package className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation()
                  handleReorder(order.id)
                }}
                disabled={isReordering}
              >
                {isReordering ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShoppingCart className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
