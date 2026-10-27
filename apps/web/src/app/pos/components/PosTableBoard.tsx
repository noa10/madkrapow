'use client'

import { Armchair, Ban, Banknote, Loader2, Plus, RefreshCw, UtensilsCrossed } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { adminLabel, parseOrderStatus } from '@/lib/orders/status'
import { closeBlockedMessage } from '@/lib/pos/tables'
import type { PosOpenOrder, RestaurantTable, TableSummary } from '@/lib/pos/types'

interface PosTableBoardProps {
  summaries: TableSummary[]
  busyId: string | null
  refreshing: boolean
  onNewOrder: (table: RestaurantTable, summary: TableSummary) => void
  onSettle: (order: PosOpenOrder) => void
  onVoid: (order: PosOpenOrder) => void
  onCloseTable: (table: RestaurantTable) => void
  onRefresh: () => void
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
}

/** Live floor plan: occupancy, open orders, unpaid balances and actions. */
export function PosTableBoard({
  summaries,
  busyId,
  refreshing,
  onNewOrder,
  onSettle,
  onVoid,
  onCloseTable,
  onRefresh,
}: PosTableBoardProps) {
  const occupied = summaries.filter((summary) => summary.isOccupied)
  const unpaidCount = summaries.reduce(
    (count, summary) =>
      count + summary.orders.filter((order) => order.status === 'pending').length,
    0
  )

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
          {unpaidCount > 0 && (
            <Badge className="border-none bg-amber-500 text-black">
              {unpaidCount} unpaid
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

                    <ul className="space-y-1">
                      {summary.orders.map((order) => (
                        <li
                          key={order.id}
                          className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5"
                        >
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
                          {order.status === 'pending' && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                onClick={() => onSettle(order)}
                                disabled={busy}
                                className="h-7 gap-1 px-2 text-[11px]"
                              >
                                <Banknote className="h-3 w-3" />
                                Collect
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onVoid(order)}
                                disabled={busy}
                                aria-label={`Void order ${order.display_code ?? ''}`}
                                title="Void this unpaid order"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </li>
                      ))}
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
                    onClick={() => onCloseTable(table)}
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
