'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { Search, ShoppingBag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ItemQuickView } from '@/components/menu/ItemQuickView'
import { RichMenuGrid } from '@/components/menu/RichMenuGrid'
import { CartStoreProvider, useCartStoreInstance } from '@/stores/cart-context'
import { getTableCartStore } from '@/stores/table-cart'
import { useToastStore } from '@/stores/toast'
import { useIsClient } from '@/hooks/useIsClient'
import { MAX_PAX, MIN_PAX } from '@/lib/pos/tables'
import {
  buildTablePaymentClaimPayload,
  nextStepAfterCreate,
  parseStoredTableOrder,
  resolveClaimStatus,
  serializeStoredTableOrder,
  type TableOrderStep,
  type TablePaymentChoice,
} from '@/lib/pos/table-orders'
import type {
  CategoryWithMenuItems,
  MenuItemWithModifiers,
  ModifierGroupsByMenuItem,
} from '@/lib/queries/menu'
import type {
  PublicTable,
  TableOrderSuccess,
  TablePaymentClaim,
} from '@/lib/pos/types'
import {
  PaymentView,
  ReviewView,
  TableOrderSuccessView,
  formatPrice,
  type TableOrderViewItem,
} from './TableOrderViews'

interface TableOrderClientProps {
  table: PublicTable
  categories: CategoryWithMenuItems[]
  modifierGroupsByItem: ModifierGroupsByMenuItem | null
}

/**
 * The public table-QR ordering surface.
 *
 * Wraps the shared menu/quick-view in an isolated per-table cart so a diner's
 * table order never mixes with the delivery cart on the same phone.
 *
 * The flow is a four-step machine — menu → review → (payment) → success — so
 * the diner sees their full order and the required pax before anything is
 * sent, and can pay by QR from the same phone.
 */
export function TableOrderClient({
  table,
  categories,
  modifierGroupsByItem,
}: TableOrderClientProps) {
  const cartStore = getTableCartStore(table.id)
  return (
    <CartStoreProvider store={cartStore}>
      <TableOrderInner
        table={table}
        categories={categories}
        modifierGroupsByItem={modifierGroupsByItem}
      />
    </CartStoreProvider>
  )
}

function TableOrderInner({
  table,
  categories,
  modifierGroupsByItem,
}: TableOrderClientProps) {
  const cart = useCartStoreInstance()
  const items = useStore(cart, (state) => state.items)
  const isHydrated = useStore(cart, (state) => state.isHydrated)
  const isClient = useIsClient()
  const subtotalCents = useStore(cart, (state) => state.getSubtotal())
  const addToast = useToastStore((state) => state.addToast)
  const cartReady = isClient && isHydrated

  const [query, setQuery] = useState('')
  // Null until the diner picks: the kitchen plans portions from pax, so there
  // is no safe default to send on their behalf.
  const [pax, setPax] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [quickViewItem, setQuickViewItem] = useState<MenuItemWithModifiers | null>(null)
  const [step, setStep] = useState<TableOrderStep>('menu')
  const [paymentChoice, setPaymentChoice] = useState<TablePaymentChoice>('counter')
  const [submitting, setSubmitting] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<TableOrderSuccess | null>(null)
  const submitLock = useRef(false)
  const claimLock = useRef(false)
  // The create request's key, kept after success: it is the order's secret for
  // the payment claim. Reset only when the diner starts a new order.
  const idempotencyKeyRef = useRef<string | null>(null)
  // Per-tab (not localStorage: a shared phone must not keep the key past the
  // meal). The payment step sends the diner into their banking app, and the
  // page can be discarded while they are there.
  const storageKey = `mkp:table-order:${table.token}`
  const resumeAttempted = useRef(false)

  const persistOrder = useCallback(
    (order: TableOrderSuccess, idempotencyKey: string) => {
      try {
        window.sessionStorage.setItem(
          storageKey,
          serializeStoredTableOrder({ success: { ...order, pax: order.pax ?? null }, idempotencyKey })
        )
      } catch {
        // Private mode / blocked storage: the flow still works in this tab.
      }
    },
    [storageKey]
  )

  const clearPersistedOrder = useCallback(() => {
    try {
      window.sessionStorage.removeItem(storageKey)
    } catch {
      // Nothing to do: a stale entry expires with the tab.
    }
  }, [storageKey])

  // Resume the diner's own order after a reload (they left to pay in their
  // banking app). Without this the page returns to an empty menu and the
  // order is stranded unpaid.
  useEffect(() => {
    if (resumeAttempted.current) return
    resumeAttempted.current = true
    let stored: ReturnType<typeof parseStoredTableOrder> = null
    try {
      stored = parseStoredTableOrder(window.sessionStorage.getItem(storageKey))
    } catch {
      stored = null
    }
    if (!stored) return
    idempotencyKeyRef.current = stored.idempotencyKey
    // sessionStorage is browser-only, so this cannot be lazy initial state
    // without breaking hydration; one resume per mount is the point.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSuccess(stored.success as TableOrderSuccess)
    // Always the status screen, never straight back into the QR payment: the
    // stored order does not record whether the diner chose the counter, and
    // re-opening the QR for a diner who is paying cash invites a second
    // payment. "Pay now by QR" on that screen enters the payment step.
    setStep('success')
  }, [storageKey])

  const menuNameById = useMemo(() => {
    const names = new Map<string, string>()
    for (const category of categories) {
      for (const item of category.menu_items) names.set(item.id, item.name)
    }
    return names
  }, [categories])

  const visibleCategories = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return categories
    return categories
      .map((category) => ({
        ...category,
        menu_items: category.menu_items.filter((item) =>
          `${item.name} ${item.description ?? ''}`.toLowerCase().includes(normalized)
        ),
      }))
      .filter((category) => category.menu_items.length > 0)
  }, [categories, query])

  const quickViewFull = useMemo(() => {
    if (!quickViewItem) return null
    return {
      ...quickViewItem,
      category: {
        id: quickViewItem.category_id,
        name:
          categories.find((category) => category.id === quickViewItem.category_id)
            ?.name ?? '',
      },
      modifier_groups: modifierGroupsByItem?.[quickViewItem.id] ?? [],
    }
  }, [quickViewItem, categories, modifierGroupsByItem])

  const viewItems = useMemo<TableOrderViewItem[]>(
    () =>
      items.map((item) => {
        const modifierIds = item.selected_modifiers.map((modifier) => modifier.id)
        const modifierTotal = item.selected_modifiers.reduce(
          (sum, modifier) => sum + modifier.price_delta_cents,
          0
        )
        return {
          key: `${item.menu_item_id}-${modifierIds.join('-')}`,
          menuItemId: item.menu_item_id,
          name: menuNameById.get(item.menu_item_id) ?? 'Item',
          quantity: item.quantity,
          lineTotalCents: (item.unit_price + modifierTotal) * item.quantity,
          modifiers: item.selected_modifiers.map((modifier) => ({
            id: modifier.id,
            name: modifier.name,
            priceDeltaCents: modifier.price_delta_cents,
          })),
          notes: item.special_instructions,
        }
      }),
    [items, menuNameById]
  )

  const handleSelectItem = useCallback(
    (item: MenuItemWithModifiers) => {
      // Never open an item that needs options without its groups — the diner
      // would be able to add it without required choices. The item page is not
      // a safe fallback here because it would leave the table context.
      if (item.has_modifiers && !modifierGroupsByItem?.[item.id]) {
        addToast({
          type: 'error',
          title: 'This dish cannot be ordered right now',
          description: 'Please ask a staff member to take your order.',
        })
        return
      }
      setQuickViewItem(item)
    },
    [modifierGroupsByItem, addToast]
  )

  const itemCount = cartReady
    ? items.reduce((sum, item) => sum + item.quantity, 0)
    : 0
  const displayedSubtotalCents = cartReady ? subtotalCents : 0

  const changePax = (delta: number) => {
    setPax((current) => {
      if (current === null) return delta > 0 ? MIN_PAX : null
      return Math.min(MAX_PAX, Math.max(MIN_PAX, current + delta))
    })
  }

  const updateQuantity = (viewItem: TableOrderViewItem, quantity: number) => {
    const modifierIds = viewItem.modifiers.map((modifier) => modifier.id)
    cart.getState().updateQuantity(viewItem.menuItemId, modifierIds, quantity)
  }

  const removeItem = (viewItem: TableOrderViewItem) => {
    const modifierIds = viewItem.modifiers.map((modifier) => modifier.id)
    cart.getState().removeItem(viewItem.menuItemId, modifierIds)
  }

  const submitOrder = async () => {
    if (submitLock.current || items.length === 0) return
    if (pax === null || !Number.isInteger(pax) || pax < MIN_PAX || pax > MAX_PAX) {
      setError(`Select the number of diners (${MIN_PAX}–${MAX_PAX})`)
      return
    }
    const paxValue = pax

    // Stable across retries of this submission: a lost response followed by a
    // retry returns the order that already landed instead of creating a second
    // ticket. Kept after success — it is the claim secret.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID()
    }

    // A ref lock closes the double-tap window before React re-renders with
    // `submitting=true`; without it two rapid taps both POST.
    submitLock.current = true
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/public/table-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_token: table.token,
          pax: paxValue,
          customer_name: customerName.trim() || undefined,
          notes: notes.trim() || undefined,
          idempotency_key: idempotencyKeyRef.current,
          items: items.map((item) => ({
            menu_item_id: item.menu_item_id,
            quantity: item.quantity,
            modifier_ids: item.selected_modifiers.map((modifier) => modifier.id),
            notes: item.special_instructions.trim() || undefined,
          })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? `Could not send the order (HTTP ${res.status})`)
        return
      }

      const created = data as TableOrderSuccess
      cart.getState().clear()
      setSuccess(created)
      setCustomerName('')
      setNotes('')
      // Persist before routing: if the phone kills the tab while the diner is
      // in their banking app, the resumed page still has the order and its
      // claim key.
      if (idempotencyKeyRef.current) {
        persistOrder(created, idempotencyKeyRef.current)
      }
      // A duplicate response can already be paid (a retry after a claim):
      // never route a paid order through the payment step again.
      setStep(
        created.status === 'pending' ? nextStepAfterCreate(paymentChoice) : 'success'
      )
    } catch {
      setError(
        'Network error — please check your connection and try again. Retrying will not send the order twice.'
      )
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  const claimPayment = async () => {
    if (!success || claimLock.current || !idempotencyKeyRef.current) return

    claimLock.current = true
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/table-orders/${success.order_id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildTablePaymentClaimPayload({
            tableToken: table.token,
            idempotencyKey: idempotencyKeyRef.current,
          })
        ),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // Any 409 means this order is not payable from the phone any more: a
        // cashier settled it, or staff cancelled it. Leaving the diner on the
        // payment screen would keep the QR scannable — they could transfer
        // money for an order that cannot be paid. Adopt the real status and
        // leave the screen either way.
        if (res.status === 409) {
          const claimed =
            data && typeof data.status === 'string'
              ? { status: data.status }
              : null
          const status = resolveClaimStatus(success.status, claimed)
          setSuccess((current) => (current ? { ...current, status } : current))
          if (idempotencyKeyRef.current) {
            persistOrder(
              { ...success, status },
              idempotencyKeyRef.current
            )
          }
          setError(null)
          setStep('success')
          return
        }
        setError(data?.error ?? `Could not record the payment (HTTP ${res.status})`)
        return
      }

      const claim = data as TablePaymentClaim
      // Trust the flag as well as the status: an already-paid order can still be
      // `pending` if its payment row landed without the status bump.
      const nextStatus = resolveClaimStatus(success.status, claim)
      setSuccess((current) => {
        if (!current) return current
        if (idempotencyKeyRef.current) {
          persistOrder(
            { ...current, status: nextStatus, paid_at: claim.paid_at },
            idempotencyKeyRef.current
          )
        }
        return { ...current, status: nextStatus, paid_at: claim.paid_at }
      })
      setStep('success')
    } catch {
      setError(
        "Network error — the payment may already be recorded. Tap I have paid to retry; it will not charge twice."
      )
    } finally {
      claimLock.current = false
      setClaiming(false)
    }
  }

  const startNewOrder = () => {
    // A new round is a new order: the old key would collide with the order it
    // already created, and the persisted copy would resume the finished one.
    idempotencyKeyRef.current = null
    clearPersistedOrder()
    setSuccess(null)
    setError(null)
    setStep('menu')
  }

  const payByQr = () => {
    if (!idempotencyKeyRef.current) {
      addToast({
        type: 'error',
        title: 'Pay by QR unavailable',
        description: 'Please ask a staff member to take your payment.',
      })
      return
    }
    setError(null)
    setStep('payment')
  }

  if (step === 'success' && success) {
    return (
      <TableOrderSuccessView
        table={table}
        success={success}
        onOrderMore={startNewOrder}
        onPayByQr={payByQr}
      />
    )
  }

  if (step === 'payment' && success) {
    return (
      <PaymentView
        table={table}
        success={success}
        claiming={claiming}
        error={error}
        onBack={() => {
          if (!claiming) {
            // The order already exists and the cart is cleared, so there is no
            // review to return to: back goes to the order's status screen.
            setError(null)
            setStep('success')
          }
        }}
        onClaim={claimPayment}
        onPayAtCounter={() => {
          // The order already reached the kitchen as `pending`; the cashier
          // collects at the counter as before.
          setError(null)
          setStep('success')
        }}
      />
    )
  }

  if (step === 'review') {
    return (
      <ReviewView
        table={table}
        items={viewItems}
        pax={pax}
        subtotalCents={subtotalCents}
        customerName={customerName}
        notes={notes}
        paymentChoice={paymentChoice}
        submitting={submitting}
        error={error}
        onBack={() => {
          if (!submitting) {
            setError(null)
            setStep('menu')
          }
        }}
        onChangePax={changePax}
        onCustomerNameChange={setCustomerName}
        onNotesChange={setNotes}
        onPaymentChoiceChange={setPaymentChoice}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onSubmit={submitOrder}
      />
    )
  }

  return (
    <main className="min-h-dvh bg-background pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Mad Krapow
            </p>
            <h1 className="truncate font-display text-lg font-extrabold text-foreground">
              Table {table.label}
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {[table.zone, `${table.seats} seats`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search dishes"
            aria-label="Search dishes"
            className="h-11 rounded-full border-border-2 bg-surface pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-surface-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {visibleCategories.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No dishes match “{query}”.
          </p>
        ) : (
          <RichMenuGrid categories={visibleCategories} onSelectItem={handleSelectItem} />
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
            <p className="text-lg font-extrabold tabular-nums text-ember-text">
              {formatPrice(displayedSubtotalCents)}
            </p>
          </div>
          <Button
            onClick={() => {
              setError(null)
              setStep('review')
            }}
            disabled={itemCount === 0 || !cartReady}
            className="min-h-12 rounded-full px-6 text-[15px] font-bold"
          >
            <ShoppingBag className="h-4 w-4" />
            Review order
          </Button>
        </div>
      </div>

      {quickViewFull && (
        <ItemQuickView item={quickViewFull} onClose={() => setQuickViewItem(null)} />
      )}
    </main>
  )
}
