'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useRoleGuard } from '@/hooks/use-role-guard'
import { useToastStore } from '@/stores/toast'
import { getBrowserClient } from '@/lib/supabase/client'
import { autoPrintOrder } from '@/lib/printing/client'
import { MAX_MERGED_QUANTITY } from '@/lib/pos/table-orders'
import { summarizeTable } from '@/lib/pos/tables'
import type { PosOpenOrder, RestaurantTable, TableSummary } from '@/lib/pos/types'
import { cn } from '@/lib/utils'
import { PosMenu } from './components/PosMenu'
import {
  PosSalePanel,
  type PosCartLine,
  type PosOrderType,
  type PosPaymentMethod,
} from './components/PosSalePanel'
import { PosSettleModal } from './components/PosSettleModal'
import { PosTableBoard } from './components/PosTableBoard'
import { usePosData, type PosMenuItem } from './hooks/usePosData'

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/** Authenticated POST helper — the POS API accepts cookie or Bearer auth. */
async function posPost(path: string, body?: unknown) {
  const supabase = getBrowserClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('cash')
  const [submitting, setSubmitting] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [settleOrder, setSettleOrder] = useState<PosOpenOrder | null>(null)
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

  const totalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.item.price_cents * line.quantity, 0),
    [cart]
  )

  const unpaidCount = useMemo(
    () => openOrders.filter((order) => order.status === 'pending').length,
    [openOrders]
  )

  const addToCart = useCallback((item: PosMenuItem) => {
    setCart((previous) => {
      const existing = previous.find((line) => line.item.id === item.id)
      if (existing) {
        return previous.map((line) =>
          line.item.id === item.id
            ? {
                ...line,
                quantity: Math.min(MAX_MERGED_QUANTITY, line.quantity + 1),
              }
            : line
        )
      }
      return [...previous, { item, quantity: 1 }]
    })
  }, [])

  const changeQuantity = useCallback((itemId: string, delta: number) => {
    setCart((previous) =>
      previous
        .map((line) =>
          line.item.id === itemId
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

  const removeLine = useCallback((itemId: string) => {
    setCart((previous) => previous.filter((line) => line.item.id !== itemId))
  }, [])

  const resetSale = useCallback(() => {
    setCart([])
    setCustomerName('')
    setPaymentMethod('cash')
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }, [refresh])

  const handleSubmit = async () => {
    if (submitLock.current || cart.length === 0) return
    if (orderType === 'dine_in' && !selectedTableId) {
      addToast({ type: 'error', title: 'Pick a table for a dine-in order' })
      return
    }
    if (orderType === 'take_away' && !customerName.trim()) {
      addToast({ type: 'error', title: 'Enter the customer name for take-away' })
      return
    }

    submitLock.current = true
    setSubmitting(true)
    try {
      const { res, json } = await posPost('/api/pos/orders', {
        items: cart.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
        })),
        payment_method: paymentMethod,
        order_type: orderType,
        table_id: orderType === 'dine_in' ? selectedTableId : undefined,
        pax: orderType === 'dine_in' ? pax : undefined,
        customer_name: customerName.trim() || undefined,
      })

      if (!res.ok) {
        addToast({
          type: 'error',
          title: 'Failed to create order',
          description: json?.error ?? `HTTP ${res.status}`,
        })
        return
      }

      const context =
        orderType === 'dine_in'
          ? `Table ${json.table_label} · ${json.pax} pax`
          : 'Take-away'
      const orderCode = json.display_code ?? json.order_number
      setLastOrderNumber(orderCode)
      addToast({
        type: 'success',
        title: `Order ${orderCode} created`,
        description: `${formatPrice(json.total_cents)} · ${context}`,
      })
      resetSale()
      await refresh()
      void autoPrintOrder(json.order_id, 'counter', (printError) =>
        addToast({ type: 'error', title: 'Print failed', description: printError })
      )
    } catch {
      addToast({ type: 'error', title: 'Network error creating order' })
    } finally {
      setSubmitting(false)
      submitLock.current = false
    }
  }

  const handleSettle = async (method: 'cash' | 'qr_pay') => {
    if (!settleOrder || busyId) return
    setBusyId(settleOrder.id)
    try {
      const { res, json } = await posPost(
        `/api/pos/orders/${settleOrder.id}/settle`,
        { payment_method: method }
      )
      if (!res.ok) {
        addToast({
          type: 'error',
          title: 'Could not collect payment',
          description: json?.error ?? `HTTP ${res.status}`,
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
      await refresh()
    } catch {
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
            onAdd={addToCart}
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
            cart={cart}
            onChangeQuantity={changeQuantity}
            onRemove={removeLine}
            onClear={resetSale}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            totalCents={totalCents}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </div>
      ) : (
        <PosTableBoard
          summaries={summaries}
          busyId={busyId}
          refreshing={refreshing}
          onNewOrder={startTableOrder}
          onSettle={setSettleOrder}
          onVoid={setVoidOrder}
          onCloseTable={setCloseTableTarget}
          onRefresh={handleRefresh}
        />
      )}

      <PosSettleModal
        order={settleOrder}
        busy={busyId === settleOrder?.id}
        onClose={() => {
          if (!busyId) setSettleOrder(null)
        }}
        onConfirm={handleSettle}
      />

      <ConfirmModal
        open={voidOrder !== null}
        onClose={() => {
          if (!busyId) setVoidOrder(null)
        }}
        title={`Void order ${voidOrder?.display_code ?? ''}?`}
        description="This cancels the unpaid table order and removes it from the kitchen queue. Use it when a diner left or mis-ordered."
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
