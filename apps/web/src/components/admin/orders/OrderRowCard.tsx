"use client"

import { useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { CompactOrderActions } from "./CompactOrderActions"
import type { Order } from "@/types/orders"

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

interface TimeInfo {
  text: string
  minutes: number
  fullTimestamp: string
}

function compactRelativeTime(iso: string): TimeInfo {
  try {
    const d = parseISO(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const minutes = Math.max(0, Math.floor(diffMs / 60000))

    let text: string
    if (minutes < 1) {
      text = "<1m"
    } else if (minutes < 60) {
      text = `${minutes}m`
    } else if (minutes < 1440) {
      text = `${Math.floor(minutes / 60)}h`
    } else {
      text = `${Math.floor(minutes / 1440)}d`
    }

    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    const fullTimestamp = isToday
      ? format(d, "h:mm a")
      : format(d, "MMM d, yyyy, h:mm a")

    return { text, minutes, fullTimestamp }
  } catch {
    return { text: "", minutes: 0, fullTimestamp: "" }
  }
}

function urgencyColor(minutes: number): string {
  if (minutes < 5) return "text-emerald-400"
  if (minutes <= 15) return "text-amber-400"
  return "text-red-400"
}

interface OrderRowCardProps {
  order: Order
  onStatusChange?: (newStatus: string) => void
}

export function OrderRowCard({ order, onStatusChange }: OrderRowCardProps) {
  const router = useRouter()

  const handleCardClick = () => {
    router.push(`/admin/orders/${order.id}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      router.push(`/admin/orders/${order.id}`)
    }
  }

  const itemCount = order.item_count
  const shortId = order.id.slice(0, 8).toUpperCase()
  const timeInfo = compactRelativeTime(order.created_at)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      aria-label={`View order #${shortId}`}
      className={cn(
        "group relative grid items-stretch w-full",
        "grid-cols-[56px_2px_1fr_auto] md:grid-cols-[72px_2px_1fr_auto]",
        "rounded-xl border border-white/8 bg-card/60 backdrop-blur-sm",
        "transition-all duration-200 cursor-pointer",
        "hover:border-gold/20 hover:bg-card",
        "active:bg-card/80 active:scale-[0.995]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "animate-fade-in-up",
        "min-h-[44px]"
      )}
    >
      {/* Col 1: Compact time */}
      {timeInfo.text && (
        <div className="flex items-center justify-end px-1 md:px-2 py-3">
          <span
            className={cn(
              "text-[10px] tabular-nums text-right whitespace-nowrap",
              urgencyColor(timeInfo.minutes)
            )}
            title={timeInfo.fullTimestamp}
          >
            {timeInfo.text}
            <span className="hidden md:inline text-muted-foreground/70"> ago</span>
          </span>
        </div>
      )}

      {/* Col 2: Gold timeline bar */}
      <div className="row-span-3 flex flex-col items-center py-3">
        <div className="w-0.5 flex-1 rounded-full bg-gradient-to-b from-gold/40 via-gold/20 to-transparent" />
        <div className="w-0.5 flex-1 rounded-full bg-gradient-to-b from-transparent via-gold/10 to-gold/40" />
      </div>

      {/* Row 1: order number + status + items */}
      <div className="col-start-3 flex items-center gap-2 min-w-0 py-3">
        <span className="text-sm font-semibold text-gold tabular-nums truncate">
          #{shortId}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border",
            STATUS_COLORS[order.status] || STATUS_COLORS.pending
          )}
        >
          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
        </span>
        {itemCount != null && (
          <span className="text-[11px] text-muted-foreground/60 shrink-0">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        )}
      </div>

      {/* Row 1: total */}
      <div className="col-start-4 flex items-center justify-end py-3 pr-3">
        <span className="text-sm font-semibold text-foreground tabular-nums">
          {formatPrice(order.total_cents + order.delivery_fee_cents)}
        </span>
      </div>

      {/* Row 2: customer + badges */}
      <div className="col-start-3 flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground truncate">
          {order.customer_name || "Guest"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {order.delivery_type === "self_pickup" && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">Pickup</Badge>
          )}
          {order.fulfillment_type === "scheduled" && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">Scheduled</Badge>
          )}
          {order.order_kind === "bulk" && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-purple-500/10 border-purple-500/30 text-purple-400">
              Bulk
            </Badge>
          )}
          {order.dispatch_status === "failed" && (
            <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Failed</Badge>
          )}
        </div>
      </div>

      {/* Row 2: secondary time */}
      <div className="col-start-4 flex items-center justify-end pr-3">
        <span className="text-[11px] text-muted-foreground/60 tabular-nums">
          {timeInfo.fullTimestamp}
        </span>
      </div>

      {/* Row 3: status actions — stopPropagation prevents card navigation */}
      <div className="col-start-3 col-span-2 pb-3 pr-3">
        <CompactOrderActions
          orderId={order.id}
          currentStatus={order.status}
          createdAt={order.created_at}
          onStatusChange={onStatusChange}
          variant="row"
        />
      </div>
    </div>
  )
}
