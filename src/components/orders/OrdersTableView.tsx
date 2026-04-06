"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: Record<string, unknown> | null
  delivery_type: string
}

const STATUS_CONFIG: Record<string, { label: string }> = {
  pending: { label: "Pending" },
  paid: { label: "Paid" },
  accepted: { label: "Accepted" },
  preparing: { label: "Preparing" },
  ready: { label: "Ready" },
  picked_up: { label: "On the Way" },
  delivered: { label: "Delivered" },
  cancelled: { label: "Cancelled" },
}

function formatPrice(amount: number) {
  return `RM ${(amount / 100).toFixed(2)}`
}

interface OrdersTableViewProps {
  orders: Order[]
}

export function OrdersTableView({ orders }: OrdersTableViewProps) {
  if (orders.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl border border-white/8 overflow-x-auto bg-card/60 backdrop-blur-sm">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/8">
            <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Order
            </th>
            <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Date
            </th>
            <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Status
            </th>
            <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium hidden sm:table-cell">
              Type
            </th>
            <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
              Total
            </th>
            <th className="w-16 px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {orders.map((order) => {
            const statusConfig = STATUS_CONFIG[order.status]
            return (
              <tr key={order.id} className="transition-colors hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <Link
                    href={`/order/${order.id}`}
                    className="text-sm font-medium text-gold hover:text-gold/80 tabular-nums"
                  >
                    #{order.id.slice(0, 8).toUpperCase()}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {format(new Date(order.created_at), "MMM d, yyyy")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className={`text-[10px] font-medium ${getStatusBadgeColors(order.status)}`}>
                    {statusConfig?.label || order.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {order.delivery_type === "self_pickup" ? (
                    <span className="text-xs text-muted-foreground">Pickup</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Delivery</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-foreground tabular-nums font-medium">
                    {formatPrice(order.total_cents)}
                  </span>
                </td>
                <td className="px-4 py-3">
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
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function getStatusBadgeColors(status: string): string {
  const colors: Record<string, string> = {
    pending: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    paid: "border-sky-500/30 bg-sky-500/10 text-sky-400",
    accepted: "border-purple-500/30 bg-purple-500/10 text-purple-400",
    preparing: "border-blue-500/30 bg-blue-500/10 text-blue-400",
    ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    picked_up: "border-orange-500/30 bg-orange-500/10 text-orange-400",
    delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    cancelled: "border-red-500/30 bg-red-500/10 text-red-400",
  }
  return colors[status] || "border-white/20 bg-white/5 text-muted-foreground"
}
