"use client"

import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/orders/money"

interface OrdersMetricCardsProps {
  totalSalesCents: number
  activeOrders: number | null
  unpaidOrders: number | null
}

function formatCount(value: number | null) {
  return value === null ? "—" : String(value)
}

interface MetricCardProps {
  label: string
  value: string
  valueClassName?: string
}

function MetricCard({ label, value, valueClassName }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-white/8 bg-card/60 p-4 backdrop-blur-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold tabular-nums", valueClassName)}>{value}</p>
    </div>
  )
}

export function OrdersMetricCards({
  totalSalesCents,
  activeOrders,
  unpaidOrders,
}: OrdersMetricCardsProps) {
  const unpaidHighlighted = unpaidOrders !== null && unpaidOrders > 0

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard
        label="Total Sales Today"
        value={formatMoney(totalSalesCents)}
        valueClassName="text-gold"
      />
      <MetricCard label="Active Orders" value={formatCount(activeOrders)} />
      <MetricCard
        label="Unpaid"
        value={formatCount(unpaidOrders)}
        valueClassName={unpaidHighlighted ? "text-amber-400" : undefined}
      />
    </div>
  )
}
