'use client'

import { useState } from 'react'
import {
  Armchair,
  Ban,
  Banknote,
  ChevronDown,
  Loader2,
  Plus,
  RefreshCw,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { adminLabel, parseOrderStatus } from '@/lib/orders/status'
import {
  buildOrderSettleTarget,
  buildTableSettleTarget,
  closeBlockedMessage,
} from '@/lib/pos/tables'
import type {
  PosOpenOrder,
  PosOrderItem,
  PosSettleTarget,
  RestaurantTable,
  TableSummary,
} from '@/lib/pos/types'

interface PosTableBoardProps {
  summaries: TableSummary[]
  unpaidTakeaway: PosOpenOrder[]
  busyId: string | null
  refreshing: boolean
  onNewOrder: (table: RestaurantTable, summary: TableSummary) => void
  /** Collect one take-away ticket or a table's grouped unpaid total. */
  onSettle: (target: PosSettleTarget) => void
  onVoid: (order: PosOpenOrder) => void
  onCloseTable: (summary: TableSummary) => void
  onRefresh: () => void
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

/** Dishes on one ticket, revealed by the chevron on its row. */
function OrderItems({ items }: { items: PosOrderItem[] | null | undefined }) {
  if (!items || items.length === 0) {
    return (
      <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] text-muted-foreground">
        No item detail recorded.
      </p>
    )
  }

  return (
    <ul className="mt-1.5 space-y-1.5 border-t border-white/10 pt-1.5">
      {items.map((item) => (
        <li key={item.id} className="text-[11px] leading-4">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 break-words text-foreground">
              <span className="font-bold tabular-nums">{item.quantity}×</span>{' '}
              {item.menu_item_name}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatPrice(item.line_total_cents)}
            </span>
          </div>
          {(item.order_item_modifiers ?? []).map((modifier, index) => (
            <div
              key={`${item.id}-${index}`}
              className="pl-4 text-[10px] leading-4 text-amber-200/90"
            >
              + {modifier.modifier_name}
              {modifier.modifier_price_delta_cents > 0 && (
                <span className="ml-1 tabular-nums text-amber-300/70">
                  (+{formatPrice(modifier.modifier_price_delta_cents)})
                </span>
              )}
            </div>
          ))}
          {item.notes && (
            <div className="pl-4 text-[10px] italic leading-4 text-muted-foreground">
              “{item.notes}”
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Live floor plan: occupancy, open orders, unpaid balances and actions. */
export function PosTableBoard({
  summaries,
  unpaidTakeaway,
  busyId,
  refreshing,
  onNewOrder,
  onSettle,
  onVoid,
  onCloseTable,
  onRefresh,
}: PosTableBoardProps) {
  const occupied = summaries.filter((summary) => summary.isOccupied)
  // Count bills, not tickets: two rounds at one table are one collect. Matches
  // the Tables-tab badge (unpaid tables + unpaid take-away tickets).
  const unpaidTableCount = summaries.filter((summary) => summary.hasUnpaid).length
  const toCollect = unpaidTableCount + unpaidTakeaway.length
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((previous) => {
      const next = new Set(previous)
      if (next.has(orderId)) next.delete(orderId)
      else next.add(orderId)
      return next
    })
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Armchair className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold text-foreground">
            {occupied.length} occupied
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {summaries.length} active table{summaries.length === 1 ? '' : 's'}
          </span>
          {toCollect > 0 && (
            <Badge
              className="border-none bg-amber-500 text-black"
              title={`${unpaidTableCount} table${unpaidTableCount === 1 ? '' : 's'} with unpaid orders, ${unpaidTakeaway.length} unpaid take-away`}
            >
              {toCollect} to collect
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {unpaidTakeaway.length > 0 && (
        <section className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-foreground">
              Unpaid take-away
            </span>
            <Badge className="border-none bg-amber-500 text-black">
              {unpaidTakeaway.length}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Collect before hand-off — the kitchen is already preparing these.
            </span>
          </div>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {unpaidTakeaway.map((order) => (
              <li
                key={order.id}
                className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-bold tabular-nums text-foreground">
                      {order.display_code ?? '—'}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {order.customer_name ?? 'Walk-in'}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatPrice(order.total_cents)} · {minutesSince(order.created_at)} min
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => onSettle(buildOrderSettleTarget(order))}
                  disabled={busyId === order.id}
                  className="h-7 gap-1 px-2 text-[11px]"
                >
                  <Banknote className="h-3 w-3" />
                  Collect
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onVoid(order)}
                  disabled={busyId === order.id}
                  aria-label={`Void order ${order.display_code ?? ''}`}
                  title="Void this unpaid order"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                >
                  <Ban className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summaries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 p-10 text-center">
          <Armchair className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-semibold text-foreground">No active tables</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add tables in Admin → Tables to start taking dine-in orders.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {summaries.map((summary) => {
            const { table } = summary
            const busy = busyId === table.id
            const closeReason = closeBlockedMessage(summary.closeBlockReason)
            const collectTarget = buildTableSettleTarget(summary)
            return (
              <article
                key={table.id}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border p-3',
                  summary.hasUnpaid
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : summary.isOccupied
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-white/10 bg-card'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {table.label}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {[table.zone, `${table.seats} seats`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge
                    className={cn(
                      'border-none',
                      summary.hasUnpaid
                        ? 'bg-amber-500 text-black'
                        : summary.isOccupied
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-white/10 text-muted-foreground'
                    )}
                  >
                    {summary.hasUnpaid
                      ? 'Unpaid'
                      : summary.isOccupied
                        ? 'Occupied'
                        : 'Free'}
                  </Badge>
                </div>

                {summary.isOccupied ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {summary.openOrderCount} order
                        {summary.openOrderCount === 1 ? '' : 's'}
                        {summary.pax ? ` · ${summary.pax} pax` : ''}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatPrice(summary.totalCents)}
                      </span>
                    </div>

                    {collectTarget && (
                      <Button
                        size="sm"
                        onClick={() => onSettle(collectTarget)}
                        disabled={busy}
                        className="w-full gap-1.5 font-bold"
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Banknote className="h-3.5 w-3.5" />
                        )}
                        Collect {formatPrice(collectTarget.amountCents)}
                        {collectTarget.orderCount > 1 && (
                          <span className="text-[11px] font-medium opacity-80">
                            · {collectTarget.orderCount} orders
                          </span>
                        )}
                      </Button>
                    )}

                    <ul className="space-y-1">
                      {summary.orders.map((order) => {
                        const expanded = expandedOrders.has(order.id)
                        return (
                          <li
                            key={order.id}
                            className="rounded-lg bg-white/5 px-2 py-1.5"
                          >
                            <div className="flex items-center gap-1.5">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-bold tabular-nums text-foreground">
                                    {order.display_code ?? '—'}
                                  </span>
                                  <span
                                    className={cn(
                                      'rounded px-1 py-0.5 text-[10px] font-semibold',
                                      order.status === 'pending'
                                        ? 'bg-amber-500/20 text-amber-400'
                                        : 'bg-white/10 text-muted-foreground'
                                    )}
                                  >
                                    {order.status === 'pending'
                                      ? 'Unpaid'
                                      : adminLabel(parseOrderStatus(order.status))}
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {formatPrice(order.total_cents)} ·{' '}
                                  {minutesSince(order.created_at)} min
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleOrder(order.id)}
                                aria-expanded={expanded}
                                aria-controls={`pos-order-items-${order.id}`}
                                aria-label={`${expanded ? 'Hide' : 'View'} items for ${
                                  order.display_code ?? 'order'
                                }`}
                                className="rounded p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                              >
                                <ChevronDown
                                  className={cn(
                                    'h-4 w-4 transition-transform',
                                    expanded && 'rotate-180'
                                  )}
                                />
                              </button>
                              {order.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => onVoid(order)}
                                  disabled={busy}
                                  aria-label={`Void order ${order.display_code ?? ''}`}
                                  title="Void this unpaid order"
                                  className="rounded p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-red-400 disabled:opacity-40"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                            <div id={`pos-order-items-${order.id}`}>
                              {expanded && <OrderItems items={order.items} />}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Table is free.</p>
                )}

                <div className="mt-auto grid grid-cols-2 gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNewOrder(table, summary)}
                    disabled={busy}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New order
                  </Button>
                  <Button
                    size="sm"
                    variant={summary.canClose ? 'default' : 'outline'}
                    onClick={() => onCloseTable(summary)}
                    disabled={busy || !summary.canClose}
                    title={closeReason ?? 'Close the table'}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UtensilsCrossed className="h-3.5 w-3.5" />
                    )}
                    Close table
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
