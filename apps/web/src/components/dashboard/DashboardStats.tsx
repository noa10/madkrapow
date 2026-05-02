"use client"

import { Package, DollarSign, Clock, TrendingUp } from "lucide-react"

interface DashboardStatsProps {
  orders: Array<{
    id: string
    status: string
    total_cents: number
    delivery_fee_cents: number
    created_at: string
  }>
}

const ACTIVE_STATUSES = ["pending", "paid", "accepted", "preparing", "ready"]

const statCards = [
  {
    title: "Total Orders",
    icon: Package,
    color: "text-gold",
    bgColor: "bg-gold/10",
    getValue: (orders: DashboardStatsProps["orders"]) => orders.length,
    format: (v: number) => v.toString(),
  },
  {
    title: "Total Spent",
    icon: DollarSign,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
    getValue: (orders: DashboardStatsProps["orders"]) =>
      orders.reduce((sum, o) => sum + (o.total_cents || 0), 0),
    format: (v: number) => `RM ${(v / 100).toFixed(2)}`,
  },
  {
    title: "Active Orders",
    icon: Clock,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
    getValue: (orders: DashboardStatsProps["orders"]) =>
      orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length,
    format: (v: number) => v.toString(),
  },
  {
    title: "Completed",
    icon: TrendingUp,
    color: "text-teal-400",
    bgColor: "bg-teal-400/10",
    getValue: (orders: DashboardStatsProps["orders"]) =>
      orders.filter((o) => o.status === "picked_up" || o.status === "delivered" || o.status === "cancelled").length,
    format: (v: number) => v.toString(),
  },
]

export function DashboardStats({ orders }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {statCards.map((stat, i) => {
        const Icon = stat.icon
        const value = stat.getValue(orders)
        return (
          <div
            key={stat.title}
            className="group relative overflow-hidden rounded-xl border border-white/8 bg-card/60 p-4 sm:p-5 backdrop-blur-sm transition-all duration-300 hover:border-gold/20 hover:bg-card"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className={`absolute right-0 top-0 h-16 w-16 translate-x-4 -translate-y-4 rounded-full ${stat.bgColor} opacity-50 blur-2xl transition-opacity group-hover:opacity-75`} />
            <div className="relative">
              <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${stat.bgColor} ${stat.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                {stat.title}
              </div>
              <div className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
                {stat.format(value)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
