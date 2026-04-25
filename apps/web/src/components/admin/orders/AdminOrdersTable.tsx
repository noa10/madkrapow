"use client"

import Link from "next/link"
import { ExternalLink, Phone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  customer_name: string | null
  customer_phone: string | null
  delivery_type: string
  fulfillment_type: string
  dispatch_status: string | null
  order_kind: string
  approval_status: string
  bulk_company_name: string | null
}

export interface OrdersByDateGroup {
  dateLabel: string
  dateKey: string
  orders: Order[]
}

function formatPrice(cents: number) {
  return `RM ${(cents / 100).toFixed(2)}`
}

interface AdminOrdersTableProps {
  groups: OrdersByDateGroup[]
}

export function AdminOrdersTableView({ groups }: AdminOrdersTableProps) {
  if (groups.length === 0) return null

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.dateKey}>
          {/* Date header */}
          <div className="sticky top-0 z-10 mb-2 flex items-center gap-3 py-2 bg-background/80 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-foreground">
              {group.dateLabel}
            </h3>
            <div className="flex-1 h-px bg-white/5" />
            <span className="text-xs text-muted-foreground tabular-nums">
              {group.orders.length} {group.orders.length === 1 ? "order" : "orders"}
            </span>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-white/8 overflow-x-auto bg-card/60 backdrop-blur-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                    Order
                  </th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium hidden md:table-cell">
                    Time
                  </th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                    Type
                  </th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                    Status
                  </th>
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                    Total
                  </th>
                  <th className="w-16 px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {group.orders.map((order) => (
                  <tr key={order.id} className="transition-colors hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-sm font-medium text-gold hover:text-gold/80 tabular-nums"
                      >
                        #{order.id.slice(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground">{order.customer_name || "Guest"}</span>
                        {order.customer_phone && (
                          <a
                            href={`tel:${order.customer_phone}`}
                            className="text-muted-foreground hover:text-gold"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(order.created_at), "h:mm a")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {order.delivery_type === "self_pickup" && (
                          <Badge variant="outline" className="text-[10px] h-5">Pickup</Badge>
                        )}
                        {order.fulfillment_type === "scheduled" && (
                          <Badge variant="outline" className="text-[10px] h-5">Scheduled</Badge>
                        )}
                        {order.order_kind === "bulk" && (
                          <Badge variant="outline" className="text-[10px] h-5 bg-purple-500/10 border-purple-500/30 text-purple-400">Bulk</Badge>
                        )}
                        {order.dispatch_status === "failed" && (
                          <Badge variant="destructive" className="text-[10px] h-5">Failed</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${getStatusColor(order.status)}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground tabular-nums font-medium">
                        {formatPrice(order.total_cents + order.delivery_fee_cents)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: "text-amber-400",
    paid: "text-sky-400",
    accepted: "text-violet-400",
    preparing: "text-orange-400",
    ready: "text-emerald-400",
    picked_up: "text-indigo-400",
    delivered: "text-teal-400",
    cancelled: "text-red-400",
  }
  return colors[status] || "text-muted-foreground"
}
