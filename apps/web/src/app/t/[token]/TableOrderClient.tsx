'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import {
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ItemQuickView } from '@/components/menu/ItemQuickView'
import { RichMenuGrid } from '@/components/menu/RichMenuGrid'
import { CartStoreProvider, useCartStoreInstance } from '@/stores/cart-context'
import { getTableCartStore } from '@/stores/table-cart'
import { useToastStore } from '@/stores/toast'
import { useIsClient } from '@/hooks/useIsClient'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { MAX_PAX, MIN_PAX } from '@/lib/pos/tables'
import type {
  CategoryWithMenuItems,
  MenuItemWithModifiers,
  ModifierGroupsByMenuItem,
} from '@/lib/queries/menu'
import type { PublicTable, TableOrderSuccess } from '@/lib/pos/types'

interface TableOrderClientProps {
  table: PublicTable
  categories: CategoryWithMenuItems[]
  modifierGroupsByItem: ModifierGroupsByMenuItem | null
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/**
 * The public table-QR ordering surface.
 *
 * Wraps the shared menu/quick-view in an isolated per-table cart so a diner's
 * table order never mixes with the delivery cart on the same phone.
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
  const [pax, setPax] = useState(2)
  const [customerName, setCustomerName] = useState('')
  const [notes, setNotes] = useState('')
  const [quickViewItem, setQuickViewItem] = useState<MenuItemWithModifiers | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<TableOrderSuccess | null>(null)
  const submitLock = useRef(false)
  // One key per submission attempt, reused by retries; see submitOrder.
  const idempotencyKeyRef = useRef<string | null>(null)

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
    setPax((current) => Math.min(MAX_PAX, Math.max(MIN_PAX, current + delta)))
  }

  const submitOrder = async () => {
    if (submitLock.current || items.length === 0) return
    if (!Number.isInteger(pax) || pax < MIN_PAX || pax > MAX_PAX) {
      setError(`Pax must be between ${MIN_PAX} and ${MAX_PAX}`)
      return
    }

    // Stable across retries of this submission: a lost response followed by a
    // retry returns the order that already landed instead of creating a second
    // ticket. Reset only after success (the cart is cleared then).
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
          pax,
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

      idempotencyKeyRef.current = null
      cart.getState().clear()
      setSuccess(data as TableOrderSuccess)
      setReviewOpen(false)
      setCustomerName('')
      setNotes('')
    } catch {
      setError(
        'Network error — please check your connection and try again. Retrying will not send the order twice.'
      )
    } finally {
      submitLock.current = false
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <TableOrderSuccessView
        table={table}
        success={success}
        onOrderMore={() => setSuccess(null)}
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

          <div className="shrink-0 text-right">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Pax
            </span>
            <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-border-2 bg-surface p-1">
              <button
                type="button"
                onClick={() => changePax(-1)}
                disabled={pax <= MIN_PAX}
                aria-label="Fewer diners"
                className="grid h-8 w-8 place-items-center rounded-full text-foreground transition hover:bg-surface-2 disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-6 text-center text-sm font-extrabold tabular-nums text-foreground">
                {pax}
              </span>
              <button
                type="button"
                onClick={() => changePax(1)}
                disabled={pax >= MAX_PAX}
                aria-label="More diners"
                className="grid h-8 w-8 place-items-center rounded-full text-foreground transition hover:bg-surface-2 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
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
            onClick={() => setReviewOpen(true)}
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

      {reviewOpen && (
        <ReviewSheet
          table={table}
          pax={pax}
          onChangePax={changePax}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          notes={notes}
          onNotesChange={setNotes}
          subtotalCents={subtotalCents}
          submitting={submitting}
          error={error}
          menuNameById={menuNameById}
          onClose={() => {
            if (!submitting) setReviewOpen(false)
          }}
          onSubmit={submitOrder}
        />
      )}
    </main>
  )
}

interface ReviewSheetProps {
  table: PublicTable
  pax: number
  onChangePax: (delta: number) => void
  customerName: string
  onCustomerNameChange: (value: string) => void
  notes: string
  onNotesChange: (value: string) => void
  subtotalCents: number
  submitting: boolean
  error: string | null
  menuNameById: ReadonlyMap<string, string>
  onClose: () => void
  onSubmit: () => void
}

function ReviewSheet({
  table,
  pax,
  onChangePax,
  customerName,
  onCustomerNameChange,
  notes,
  onNotesChange,
  subtotalCents,
  submitting,
  error,
  menuNameById,
  onClose,
  onSubmit,
}: ReviewSheetProps) {
  const cart = useCartStoreInstance()
  const items = useStore(cart, (state) => state.items)
  const panelRef = useRef<HTMLDivElement>(null)

  useBodyScrollLock(true)
  useDialogFocus(panelRef)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [submitting, onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Review your order"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl outline-none sm:rounded-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="flex-1 text-[15px] font-extrabold text-foreground">
            Your order · Table {table.label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close review"
            className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-foreground transition hover:bg-surface-3"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <ul className="space-y-3">
            {items.map((item) => {
              const modifierIds = item.selected_modifiers.map((modifier) => modifier.id)
              const modifierTotal = item.selected_modifiers.reduce(
                (sum, modifier) => sum + modifier.price_delta_cents,
                0
              )
              return (
                <li
                  key={`${item.menu_item_id}-${modifierIds.join('-')}`}
                  className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">
                      {item.quantity}×{' '}
                      {menuNameById.get(item.menu_item_id) ?? 'Item'}
                    </p>
                    {item.selected_modifiers.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {item.selected_modifiers.map((modifier) => (
                          <li
                            key={modifier.id}
                            className="text-[11px] leading-4 text-amber-200"
                          >
                            + {modifier.name}
                            {modifier.price_delta_cents > 0 && (
                              <span className="ml-1 tabular-nums text-amber-300/80">
                                (+RM {(modifier.price_delta_cents / 100).toFixed(2)})
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.special_instructions.trim() && (
                      <p className="mt-0.5 text-xs italic text-muted-foreground">
                        “{item.special_instructions.trim()}”
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {formatPrice(
                      (item.unit_price + modifierTotal) * item.quantity
                    )}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        cart.getState().updateQuantity(item.menu_item_id, modifierIds, item.quantity - 1)
                      }
                      aria-label="Remove one"
                      className="grid h-7 w-7 place-items-center rounded-full border border-border-2 text-foreground hover:bg-surface-2"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        cart.getState().updateQuantity(item.menu_item_id, modifierIds, item.quantity + 1)
                      }
                      aria-label="Add one"
                      className="grid h-7 w-7 place-items-center rounded-full border border-border-2 text-foreground hover:bg-surface-2"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => cart.getState().removeItem(item.menu_item_id, modifierIds)}
                      aria-label="Remove item"
                      className="grid h-7 w-7 place-items-center rounded-full text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Pax (required)</span>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onChangePax(-1)}
                  disabled={pax <= MIN_PAX}
                  aria-label="Fewer diners"
                  className="grid h-8 w-8 place-items-center rounded-full border border-border-2 text-foreground hover:bg-surface-2 disabled:opacity-40"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-base font-extrabold tabular-nums text-foreground">
                  {pax}
                </span>
                <button
                  type="button"
                  onClick={() => onChangePax(1)}
                  disabled={pax >= MAX_PAX}
                  aria-label="More diners"
                  className="grid h-8 w-8 place-items-center rounded-full border border-border-2 text-foreground hover:bg-surface-2 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="table-customer-name" className="text-sm font-semibold text-foreground">
              Name (optional)
            </label>
            <Input
              id="table-customer-name"
              value={customerName}
              onChange={(event) => onCustomerNameChange(event.target.value)}
              placeholder="So we can call your order"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="table-order-notes" className="text-sm font-semibold text-foreground">
              Notes (optional)
            </label>
            <textarea
              id="table-order-notes"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Allergies, preferences…"
              maxLength={500}
              rows={2}
              className="w-full resize-none rounded-lg border border-border-2 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-xl font-extrabold tabular-nums text-ember-text">
              {formatPrice(subtotalCents)}
            </span>
          </div>
          <Button
            onClick={onSubmit}
            disabled={submitting || items.length === 0}
            className="min-h-12 w-full rounded-full text-[15px] font-bold"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Send order · ${formatPrice(subtotalCents)}`
            )}
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Pay at the counter after sending your order.
          </p>
        </div>
      </div>
    </div>
  )
}

function TableOrderSuccessView({
  table,
  success,
  onOrderMore,
}: {
  table: PublicTable
  success: TableOrderSuccess
  onOrderMore: () => void
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" />
        <h1 className="mt-4 font-display text-2xl font-extrabold text-foreground">
          Order sent to the kitchen
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Table {table.label} · {success.pax} pax
        </p>

        <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Order code
          </p>
          <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-gold">
            {success.display_code || success.order_number}
          </p>
          <p className="mt-3 text-lg font-extrabold tabular-nums text-ember-text">
            {formatPrice(success.total_cents)}
          </p>
        </div>

        <p className="mt-5 rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
          Please pay at the counter. Keep this code to collect your order.
        </p>

        <Button
          onClick={onOrderMore}
          variant="outline"
          className="mt-6 min-h-11 w-full rounded-full font-bold"
        >
          Order more
        </Button>
      </div>
    </main>
  )
}
