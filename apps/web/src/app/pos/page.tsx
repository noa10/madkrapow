'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useRoleGuard } from '@/hooks/use-role-guard'
import { useToastStore } from '@/stores/toast'
import { MAX_MERGED_QUANTITY } from '@/lib/pos/table-orders'
import {
  posCartLineKey,
  posLineTotalCents,
  type PosCartModifier,
} from '@/lib/pos/cart'
import { summarizeTable } from '@/lib/pos/tables'
import type { PosOpenOrder, RestaurantTable, TableSummary } from '@/lib/pos/types'
import { cn } from '@/lib/utils'
import { PosMenu } from './components/PosMenu'
import { PosItemOptionsModal } from './components/PosItemOptionsModal'
import {
  PosSalePanel,
  type PosCartLine,
  type PosOrderType,
  type PosPaymentMethod,
  type PosPaymentTiming,
} from './components/PosSalePanel'
import { PosPayNowModal } from './components/PosPayNowModal'
import { PosSettleModal } from './components/PosSettleModal'
import { PosTableBoard } from './components/PosTableBoard'
import { usePosData, type PosMenuItem, type PosModifierGroup } from './hooks/usePosData'

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/**
 * Authenticated POST helper for the POS.
 *
 * The web POS is same-origin and the staff session lives in Supabase's auth
 * cookies, so the route authenticates from the cookie jar exactly like the
 * admin API calls do. Do not gate the request on `auth.getSession()`: that
 * adds a Web-Lock-protected auth round-trip to every tap and can leave the
 * cashier staring at a button that never fires.
 */
async function posPost(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  return { res, json }
}

type PosView = 'sale' | 'tables'

export default function PosPage() {
  const { hasAccess, isLoading: accessLoading } = useRoleGuard([
    'admin',
    'manager',
    'cashier',
  ])
  const addToast = useToastStore((state) => state.addToast)
  const {
    categories,
    itemsByCategory,
    modifierGroupsByItem,
    itemsWithModifiers,
    noModifierItems,
    loadModifierGroupsForItem,
    tables,
    openOrders,
    loading,
    error,
    refresh,
  } = usePosData(Boolean(hasAccess))

  const [view, setView] = useState<PosView>('sale')
  const [orderType, setOrderType] = useState<PosOrderType>('dine_in')
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [pax, setPax] = useState(2)
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<PosCartLine[]>([])
  const [optionsItem, setOptionsItem] = useState<{
    item: PosMenuItem
    groups: PosModifierGroup[]
  } | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash')
  const [paymentTiming, setPaymentTiming] = useState<PosPaymentTiming>('pay_now')
  const [payNowOpen, setPayNowOpen] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [settleOrder, setSettleOrder] = useState<PosOpenOrder | null>(null)
  const [settleError, setSettleError] = useState<string | null>(null)
  const [voidOrder, setVoidOrder] = useState<PosOpenOrder | null>(null)
  const [closeTableTarget, setCloseTableTarget] = useState<RestaurantTable | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const submitLock = useRef(false)

  const summaries = useMemo<TableSummary[]>(
    () =>
      tables.map((table) =>
        summarizeTable(
          table,
          openOrders.filter((order) => order.table_id === table.id)
        )
      ),
    [tables, openOrders]
  )

  const summariesByTableId = useMemo(
    () => new Map(summaries.map((summary) => [summary.table.id, summary])),
    [summaries]
  )

  /** A pay-later ticket already open at the selected table, if any. */
  const pendingOrderAtTable = useMemo(() => {
    if (!selectedTableId) return null
    const summary = summariesByTableId.get(selectedTableId)
    return summary?.orders.find((order) => order.status === 'pending') ?? null
  }, [selectedTableId, summariesByTableId])

  const totalCents = useMemo(
    () =>
      cart.reduce(
        (sum, line) =>
          sum + posLineTotalCents(line.item.price_cents, line.modifiers, line.quantity),
        0
      ),
    [cart]
  )

  const unpaidCount = useMemo(
    () => openOrders.filter((order) => order.status === 'pending').length,
    [openOrders]
  )

  const unpaidTakeaway = useMemo(
    () =>
      openOrders.filter(
        (order) =>
          order.status === 'pending' && order.delivery_type === 'self_pickup'
      ),
    [openOrders]
  )

  const selectedTable = tables.find((table) => table.id === selectedTableId)
  const qrLabel =
    orderType === 'dine_in'
      ? `${selectedTable?.label ? `Table ${selectedTable.label}` : 'Dine-in'} · ${pax} pax`
      : `Take-away · ${customerName.trim() || 'Walk-in'}`

  const addToCart = useCallback(
    (
      item: PosMenuItem,
      modifiers: PosCartModifier[] = [],
      notes = '',
      quantity = 1
    ) => {
      const key = posCartLineKey(
        item.id,
        modifiers.map((modifier) => modifier.id),
        notes
      )
      setCart((previous) => {
        const existing = previous.find((line) => line.key === key)
        if (existing) {
          return previous.map((line) =>
            line.key === key
              ? {
                  ...line,
                  quantity: Math.min(
                    MAX_MERGED_QUANTITY,
                    line.quantity + quantity
                  ),
                }
              : line
          )
        }
        return [
          ...previous,
          {
            key,
            item,
            quantity: Math.min(MAX_MERGED_QUANTITY, quantity),
            modifiers,
            notes,
          },
        ]
      })
    },
    []
  )

  const handleMenuSelect = useCallback(
    async (item: PosMenuItem) => {
      const cached = modifierGroupsByItem.get(item.id)
      if (cached && cached.length > 0) {
        setOptionsItem({ item, groups: cached })
        return
      }

      if (noModifierItems.has(item.id)) {
        addToCart(item)
        return
      }

      // Prefetch empty/stale or groups missing: check the DB before adding, so
      // a customizable dish can never be added without its options.
      const groups = await loadModifierGroupsForItem(item.id)
      if (groups === null) {
        addToast({
          type: 'error',
          title: 'Could not load options',
          description: 'Please retry. The dish was not added to the sale.',
        })
        return
      }
      if (groups.length > 0) {
        setOptionsItem({ item, groups })
        return
      }

      addToCart(item)
    },
    [
      modifierGroupsByItem,
      noModifierItems,
      loadModifierGroupsForItem,
      addToCart,
      addToast,
    ]
  )

  const changeQuantity = useCallback((lineKey: string, delta: number) => {
    setCart((previous) =>
      previous
        .map((line) =>
          line.key === lineKey
            ? {
                ...line,
                quantity: Math.min(
                  MAX_MERGED_QUANTITY,
                  Math.max(0, line.quantity + delta)
                ),
              }
            : line
        )
        .filter((line) => line.quantity > 0)
    )
  }, [])

  const removeLine = useCallback((lineKey: string) => {
    setCart((previous) => previous.filter((line) => line.key !== lineKey))
  }, [])

  const resetSale = useCallback(() => {
    setCart([])
    setCustomerName('')
    setPaymentMethod('cash')
    setPaymentTiming('pay_now')
    setPayNowOpen(false)
    setSubmitError(null)
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }, [refresh])

  const submitOrder = async (methodOverride?: PosPaymentMethod) => {
    if (submitLock.current || cart.length === 0) return
    if (orderType === 'dine_in' && !selectedTableId) {
      addToast({ type: 'error', title: 'Pick a table for a dine-in order' })
      return
    }
    if (orderType === 'take_away' && !customerName.trim()) {
      addToast({ type: 'error', title: 'Enter the customer name for take-away' })
      return
    }

    const payLater = paymentTiming === 'pay_later'
    const method = payLater ? undefined : methodOverride ?? paymentMethod

    submitLock.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { res, json } = await posPost('/api/pos/orders', {
        items: cart.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
          modifier_ids: line.modifiers.map((modifier) => modifier.id),
          notes: line.notes || undefined,
        })),
        payment_timing: payLater ? 'pay_later' : 'pay_now',
        payment_method: method,
        order_type: orderType,
        table_id: orderType === 'dine_in' ? selectedTableId : undefined,
        pax: orderType === 'dine_in' ? pax : undefined,
        customer_name: customerName.trim() || undefined,
      })

      if (!res.ok) {
        const message = json?.error ?? `HTTP ${res.status}`
        // Keep the dialog open with the reason: a toast alone sits under the
        // modal's top layer and reads as "nothing happened".
        setSubmitError(message)
        addToast({ type: 'error', title: 'Could not record the order', description: message })
        return
      }

      const context =
        orderType === 'dine_in'
          ? `Table ${json.table_label} · ${json.pax} pax`
          : 'Take-away'
      const orderCode = json.display_code ?? json.order_number
      const createdOrder: PosOpenOrder = {
        id: json.order_id,
        display_code: json.display_code ?? null,
        status: json.status ?? (payLater ? 'pending' : 'paid'),
        total_cents: json.total_cents,
        created_at: new Date().toISOString(),
        customer_name: customerName.trim() || null,
        pax: json.pax ?? null,
        table_id: orderType === 'dine_in' ? selectedTableId : null,
        table_label: json.table_label ?? null,
        delivery_type: orderType === 'dine_in' ? 'dine_in' : 'self_pickup',
        source: 'counter',
      }
      setLastOrderNumber(orderCode)
      addToast({
        type: 'success',
        title: payLater
          ? `Order ${orderCode} sent to the kitchen`
          : `Order ${orderCode} paid`,
        description: `${formatPrice(json.total_cents)} · ${context}${
          payLater ? ' · Pay later' : ''
        }`,
        action: payLater
          ? {
              label: 'Collect payment',
              onClick: () => {
                setSettleError(null)
                setSettleOrder(createdOrder)
              },
            }
          : undefined,
      })
      resetSale()
      // The kitchen docket (and, once settled, the receipt) is claimed and
      // printed by the LAN bridge polling /api/print/jobs/claim. Printing
      // from the page too would duplicate every ticket as a REPRINT.
      await refresh()
    } catch {
      // The request may have committed before the connection dropped. Tell the
      // cashier to check the board first so a blind retry cannot double-ring.
      const message =
        'Network error. Check the table board before retrying — the order may already be recorded.'
      setSubmitError(message)
      addToast({ type: 'error', title: 'Network error creating order', description: message })
    } finally {
      setSubmitting(false)
      submitLock.current = false
    }
  }

  /** Pay-now sales confirm inside the payment dialog before the order exists. */
  const handleSubmit = () => {
    if (paymentTiming === 'pay_later') {
      void submitOrder()
      return
    }
    setSubmitError(null)
    setPayNowOpen(true)
  }

  const handlePayNowConfirm = () => {
    void submitOrder(paymentMethod)
  }

  const handleSettle = async (method: 'cash' | 'qr_pay') => {
    if (!settleOrder || busyId) return
    setBusyId(settleOrder.id)
    setSettleError(null)
    try {
      const { res, json } = await posPost(
        `/api/pos/orders/${settleOrder.id}/settle`,
        { payment_method: method }
      )
      if (!res.ok) {
        const message = json?.error ?? `HTTP ${res.status}`
        setSettleError(message)
        addToast({
          type: 'error',
          title: 'Could not collect payment',
          description: message,
        })
        return
      }
      addToast({
        type: 'success',
        title: 'Payment collected',
        description: `${settleOrder.display_code ?? 'Order'} · ${formatPrice(
          json.amount_cents ?? settleOrder.total_cents
        )}`,
      })
      setSettleOrder(null)
      setSettleError(null)
      await refresh()
    } catch {
      setSettleError('Network error — check the connection and try again.')
      addToast({ type: 'error', title: 'Network error' })
    } finally {
      setBusyId(null)
    }
  }

  const handleVoid = async () => {
    if (!voidOrder || busyId) return
    const order = voidOrder
    setBusyId(order.id)
    try {
      const { res, json } = await posPost(
        `/api/admin/orders/${order.id}/status`,
        { status: 'cancelled' }
      )
      if (!res.ok) {
        addToast({
          type: 'error',
          title: 'Could not void the order',
          description: json?.error ?? `HTTP ${res.status}`,
        })
        return
      }
      addToast({
        type: 'success',
        title: `Order ${order.display_code ?? ''} voided`,
        description: 'The unpaid ticket was removed from the kitchen queue.',
      })
      setVoidOrder(null)
      await refresh()
    } catch {
      addToast({ type: 'error', title: 'Network error' })
    } finally {
      setBusyId(null)
    }
  }

  const handleCloseTable = async () => {
    if (!closeTableTarget || busyId) return
    const table = closeTableTarget
    setBusyId(table.id)
    try {
      const { res, json } = await posPost(`/api/pos/tables/${table.id}/close`)
      if (!res.ok) {
        addToast({
          type: 'error',
          title: 'Could not close the table',
          description: json?.error ?? `HTTP ${res.status}`,
        })
        return
      }
      addToast({
        type: 'success',
        title: `Table ${table.label} closed`,
        description: `${json.closed} order${json.closed === 1 ? '' : 's'} marked served.`,
      })
      setCloseTableTarget(null)
      if (selectedTableId === table.id) setSelectedTableId(null)
      await refresh()
    } catch {
      addToast({ type: 'error', title: 'Network error' })
    } finally {
      setBusyId(null)
    }
  }

  const startTableOrder = (table: RestaurantTable, summary: TableSummary) => {
    setOrderType('dine_in')
    setSelectedTableId(table.id)
    setPax(summary.pax ?? 2)
    resetSale()
    setView('sale')
  }

  if (accessLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Staff access required.</p>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h1 className="text-base font-bold text-foreground">Counter POS</h1>
          {lastOrderNumber && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Last: {lastOrderNumber}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => setView('sale')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-bold transition',
                view === 'sale'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Sale
            </button>
            <button
              type="button"
              onClick={() => setView('tables')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition',
                view === 'tables'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Tables
              {unpaidCount > 0 && (
                <Badge className="border-none bg-amber-500 px-1.5 text-[10px] text-black">
                  {unpaidCount}
                </Badge>
              )}
            </button>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin">
              <ArrowLeft className="h-3.5 w-3.5" />
              Admin
            </Link>
          </Button>
        </div>
      </header>

      {error && (
        <p className="border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      {view === 'sale' ? (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <PosMenu
            categories={categories}
            itemsByCategory={itemsByCategory}
            itemsWithModifiers={itemsWithModifiers}
            onSelect={handleMenuSelect}
          />
          <PosSalePanel
            orderType={orderType}
            onOrderTypeChange={setOrderType}
            tables={tables}
            summaries={summariesByTableId}
            selectedTableId={selectedTableId}
            onSelectTable={setSelectedTableId}
            pax={pax}
            onPaxChange={setPax}
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
            pendingOrder={pendingOrderAtTable}
            onCollectUnpaid={(order) => {
              setSettleError(null)
              setSettleOrder(order)
            }}
            cart={cart}
            onChangeQuantity={changeQuantity}
            onRemove={removeLine}
            onClear={resetSale}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            paymentTiming={paymentTiming}
            onPaymentTimingChange={setPaymentTiming}
            totalCents={totalCents}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        <PosTableBoard
          summaries={summaries}
          unpaidTakeaway={unpaidTakeaway}
          busyId={busyId}
          refreshing={refreshing}
          onNewOrder={startTableOrder}
          onSettle={(order) => {
            setSettleError(null)
            setSettleOrder(order)
          }}
          onVoid={setVoidOrder}
          onCloseTable={setCloseTableTarget}
          onRefresh={handleRefresh}
        />
      )}

      <PosPayNowModal
        open={payNowOpen}
        method={paymentMethod}
        amountCents={totalCents}
        label={qrLabel}
        busy={submitting}
        error={submitError}
        onClose={() => {
          if (!submitting) {
            setPayNowOpen(false)
            setSubmitError(null)
          }
        }}
        onConfirm={handlePayNowConfirm}
      />

      {optionsItem && (
        <PosItemOptionsModal
          key={optionsItem.item.id}
          item={optionsItem.item}
          groups={optionsItem.groups}
          onClose={() => setOptionsItem(null)}
          onAdd={({ quantity, modifiers, notes }) => {
            addToCart(optionsItem.item, modifiers, notes, quantity)
            setOptionsItem(null)
          }}
        />
      )}

      <PosSettleModal
        key={settleOrder?.id ?? 'no-settle-order'}
        order={settleOrder}
        busy={busyId !== null}
        error={settleError}
        onClose={() => {
          if (!busyId) {
            setSettleOrder(null)
            setSettleError(null)
          }
        }}
        onConfirm={handleSettle}
      />

      <ConfirmModal
        open={voidOrder !== null}
        onClose={() => {
          if (!busyId) setVoidOrder(null)
        }}
        title={`Void order ${voidOrder?.display_code ?? ''}?`}
        description="This cancels the unpaid order and removes it from the kitchen queue. Use it when a customer left or the order was keyed incorrectly."
        confirmLabel="Void order"
        variant="danger"
        loading={busyId !== null && busyId === voidOrder?.id}
        onConfirm={handleVoid}
      />

      <ConfirmModal
        open={closeTableTarget !== null}
        onClose={() => {
          if (!busyId) setCloseTableTarget(null)
        }}
        title={`Close table ${closeTableTarget?.label ?? ''}?`}
        description="Every order at the table must be paid and ready. Closing marks them served and frees the table for the next guests."
        confirmLabel="Close table"
        variant="warning"
        loading={busyId !== null && busyId === closeTableTarget?.id}
        onConfirm={handleCloseTable}
      />
    </div>
  )
}
