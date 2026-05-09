"use client"

import { DollarSign, ClipboardList, CheckCircle2, XCircle } from "lucide-react"
import type { Order } from "@/types/orders"

function formatPrice(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`
}

interface HistoryTabSummaryProps {
  orders: Order[]
}

export function HistoryTabSummary({ orders }: HistoryTabSummaryProps) {
  const totalCents = orders.reduce((sum, o) => sum + o.total_cents + o.delivery_fee_cents, 0)
  const orderCount = orders.length
  const completedCount = orders.filter(
    (o) => o.status === "picked_up" || o.status === "delivered" || o.status === "completed"
  ).length
  const cancelledCount = orders.filter((o) => o.status === "cancelled").length

  const items = [
    {
      label: "Total Sales",
      value: formatPrice(totalCents),
      icon: DollarSign,
      color: "text-gold",
      bg: "bg-gold/10",
    },
    {
      label: "Orders",
      value: String(orderCount),
      icon: ClipboardList,
      color: "text-sky-400",
      bg: "bg-sky-500/10",
    },
    {
      label: "Completed",
      value: String(completedCount),
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Cancelled",
      value: String(cancelledCount),
      icon: XCircle,
      color: "text-red-400",
      bg: "bg-red-500/10",
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.label}
            className="rounded-xl border border-white/8 bg-card/60 p-3 backdrop-blur-sm"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${item.bg}`}>
                <Icon className={`h-3.5 w-3.5 ${item.color}`} />
              </div>
              <span className="text-[11px] text-muted-foreground">{item.label}</span>
            </div>
            <p className="text-lg font-bold text-foreground tabular-nums">{item.value}</p>
          </div>
        )
      })}
    </div>
  )
}
