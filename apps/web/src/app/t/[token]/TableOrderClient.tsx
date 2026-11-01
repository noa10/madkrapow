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
  buildTablePaymentStatusPayload,
  isChangedDuplicate,
  isPayableOrder,
  isStaleLiveRead,
  nextStepAfterCreate,
  parseStoredTableOrder,
  parseTableOrderStatus,
  parseTableOrderSuccess,
  parseTablePaymentClaim,
  resolveClaimOutcome,
  resolveLiveStatus,
  serializeStoredTableOrder,
  type TableOrderStep,
  type TablePaymentChoice,
} from '@/lib/pos/table-orders'
import {
  INITIAL_TABLE_PAYMENT_STATE,
  nextTablePaymentState,
  type TablePaymentEvent,
  type TablePaymentState,
} from '@/lib/pos/table-payment-state'
import { isPaidOrderStatus } from '@/lib/pos/receipt'
import type {
  CategoryWithMenuItems,
  MenuItemWithModifiers,
  ModifierGroupsByMenuItem,
} from '@/lib/queries/menu'
import type {
  PublicTable,
  TableOrderStatus,
  TableOrderSuccess,
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
  /**
   * What the client believes about paying this order from the phone.
   *
   * The rules live in `@/lib/pos/table-payment-state` so they can be unit
   * tested: `confirmed` is the live confirmation that gates the payment QR,
   * and it is earned by a server read and lost by anything that is not one.
   */
  const [paymentState, setPaymentState] = useState<TablePaymentState>(
    INITIAL_TABLE_PAYMENT_STATE
  )
  const [checking, setChecking] = useState(false)
  /** A standing message for the status screen (e.g. a duplicate order). */
  const [notice, setNotice] = useState<string | null>(null)
  const submitLock = useRef(false)
  const claimLock = useRef(false)
  // The last order the client knows about, readable from a callback without
  // waiting for a re-render.
  const successRef = useRef<TableOrderSuccess | null>(null)
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

  const applySuccess = useCallback((next: TableOrderSuccess | null) => {
    successRef.current = next
    setSuccess(next)
  }, [])

  /**
   * Record the order in state and in session storage.
   *
   * The write is deliberately outside any state updater: React may run an
   * updater more than once, and a side effect must not depend on how many
   * times the framework calls it.
   */
  const commitSuccess = useCallback(
    (next: TableOrderSuccess) => {
      applySuccess(next)
      const key = idempotencyKeyRef.current
      if (key) persistOrder(next, key)
    },
    [applySuccess, persistOrder]
  )

  /**
   * Ask the server what the order's real status is.
   *
   * The phone's own snapshot can be stale: a claim whose response was lost
   * (the phone switched to the banking app) leaves it saying "pending" for an
   * order that is already paid. Only the server knows.
   */
  const refreshStatus = useCallback(async (): Promise<TableOrderStatus | null> => {
    const current = successRef.current
    const key = idempotencyKeyRef.current
    if (!current || !key) return null
    try {
      const res = await fetch(
        `/api/public/table-orders/${current.order_id}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildTablePaymentStatusPayload({
              tableToken: table.token,
              idempotencyKey: key,
            })
          ),
        }
      )
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      return parseTableOrderStatus(data)
    } catch {
      return null
    }
  }, [table.token])

  /**
   * Record what the server (or the diner) told us about the payment.
   *
   * Every write to the payment state goes through the pure transition rules in
   * `@/lib/pos/table-payment-state`, so the "the QR needs a live confirmation"
   * rule is unit tested rather than buried in this component.
   */
  const applyPaymentEvent = useCallback((event: TablePaymentEvent) => {
    setPaymentState((previous) => nextTablePaymentState(previous, event))
  }, [])

  /** Adopt a server-confirmed status. */
  const applyLiveStatus = useCallback(
    (live: TableOrderStatus) => {
      const current = successRef.current
      if (!current) return
      // A late response for an earlier order (a refresh still in flight when
      // the diner started a new round) must never be merged into the order
      // now on screen.
      if (live.order_id && live.order_id !== current.order_id) return
      // A "pending" read that lands after the claim committed is a stale
      // response, not a reversal: applying it would put a live QR back on a
      // paid order.
      if (isStaleLiveRead(current.status, live.status)) return

      const status = resolveLiveStatus(live.status, live.payment_recorded)
      const paidAt = live.paid_at ?? current.paid_at ?? null
      const paymentMethod =
        live.payment_method ?? current.payment_method ?? null
      // Only touch state when something actually changed: the payment screen
      // re-checks on a timer, and an unconditional write would re-render (and
      // re-run the effect) forever.
      if (
        status !== current.status ||
        (current.paid_at ?? null) !== paidAt ||
        (current.payment_method ?? null) !== paymentMethod
      ) {
        commitSuccess({
          ...current,
          status,
          paid_at: paidAt,
          payment_method: paymentMethod,
        })
      }
      // Only a pending, unpaid order can still be paid from the phone.
      const payableNow = isPayableOrder({
        status,
        paymentRecorded: live.payment_recorded,
      })
      // A successful read is the only thing that may show the payment QR.
      applyPaymentEvent({ type: 'read', payable: payableNow })
    },
    [applyPaymentEvent, commitSuccess]
  )

  /** Re-read the order's status on demand (the "check status" button). */
  const checkStatus = useCallback(async () => {
    setChecking(true)
    try {
      const live = await refreshStatus()
      if (live) {
        // The read itself clears the block when the order is still payable.
        applyLiveStatus(live)
      } else {
        setNotice(
          'We could not confirm your order status. Please ask a staff member before paying again.'
        )
      }
    } finally {
      setChecking(false)
    }
  }, [applyLiveStatus, refreshStatus])

  /**
   * After an ambiguous claim failure, ask the server what actually happened.
   *
   * - `payable`: the ledger says the money never moved, so a retry is safe.
   * - `unconfirmed`: the server could not be reached; the QR is hidden.
   * - `moved-on`: the order is paid or cancelled; the screen moved to it.
   */
  const reconcileAfterFailedClaim = useCallback(
    async (): Promise<'payable' | 'unconfirmed' | 'moved-on'> => {
      const live = await refreshStatus()
      if (!live) {
        // We cannot confirm the order is still payable, so stop showing a
        // scannable QR. The status screen's "check status" button can recover.
        applyPaymentEvent({ type: 'read_unconfirmed' })
        return 'unconfirmed'
      }
      applyLiveStatus(live)
      if (
        isPayableOrder({
          status: live.status,
          paymentRecorded: live.payment_recorded,
        })
      ) {
        return 'payable'
      }
      setStep('success')
      return 'moved-on'
    },
    [applyLiveStatus, applyPaymentEvent, refreshStatus]
  )

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
    applySuccess(stored.success)
    // Always the status screen, never straight back into the QR payment: the
    // stored order does not record whether the diner chose the counter, and
    // re-opening the QR for a diner who is paying cash invites a second
    // payment. "Pay now by QR" on that screen enters the payment step.
    setStep('success')
    // The snapshot is not the truth. A claim whose response was lost leaves it
    // saying "pending" for an order that is already paid, so confirm with the
    // server before offering the payment QR.
    void refreshStatus().then((live) => {
      if (live) applyLiveStatus(live)
    })
  }, [applyLiveStatus, applySuccess, refreshStatus, storageKey])

  // A cashier can settle the bill, or staff can cancel the order, while the
  // diner sits on the payment screen. Re-check while it is open so a live QR
  // is never left in front of an order that is already paid — and re-check
  // when the phone comes back from the banking app.
  //
  // The status screen polls too: it tells the diner to pay at the counter, and
  // that instruction goes stale the moment the cashier settles the table in
  // cash. A read every 15s flips the screen to "already paid" on its own.
  useEffect(() => {
    if (step !== 'payment' && step !== 'success') return
    // Nothing left to watch once the order is settled: the screen shows the
    // receipt, and a diner who needs a change asks a staff member. Stopping
    // here keeps the read rate proportional to the orders still in play.
    if (
      step === 'success' &&
      success &&
      (isPaidOrderStatus(success.status) || success.status === 'cancelled')
    ) {
      return
    }
    let cancelled = false
    const check = async () => {
      // Never race the claim itself.
      if (claimLock.current) return
      const live = await refreshStatus()
      if (cancelled) return
      if (!live) {
        // The read failed, so nothing is confirmed. Hide the QR: the cashier
        // may have settled this order in cash while the diner sat here, and a
        // scannable DuitNow code on a settled order is a second transfer out
        // of the diner's pocket. The next successful read brings it back.
        applyPaymentEvent({ type: 'read_failed' })
        return
      }
      applyLiveStatus(live)
      if (
        !isPayableOrder({
          status: live.status,
          paymentRecorded: live.payment_recorded,
        })
      ) {
        setStep('success')
      }
    }
    void check()
    const timer = window.setInterval(() => {
      void check()
    }, 15000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [applyLiveStatus, applyPaymentEvent, refreshStatus, step, success])

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

      const created = parseTableOrderSuccess(data)
      if (!created) {
        // A 2xx we cannot read is not an order. The request may well have
        // landed, so the cart stays: the diner must not lose the order they
        // just built because the response body was truncated.
        setError(
          'We could not read the server’s response, so we cannot confirm your order. Please check with a staff member before paying again.'
        )
        return
      }

      // A retry after a lost response returns the order that already landed.
      // If the cart has changed since then, that order holds the OLD items:
      // the edit was never sent and the amount on the QR is the old one.
      if (isChangedDuplicate(created, subtotalCents)) {
        // The cart still holds the items already sent PLUS the diner's edits.
        // Keeping it would let "Order more" re-send the whole cart and bill
        // the sent dishes a second time, so it is cleared and the diner adds
        // only the extras.
        cart.getState().clear()
        commitSuccess(created)
        setNotice(
          'This order was already sent to the kitchen with your earlier items, so your latest changes were not applied. Add any extras as a new order.'
        )
        applyPaymentEvent({
          type: 'order_created',
          payable: isPayableOrder({ status: created.status }),
        })
        setStep('success')
        return
      }

      cart.getState().clear()
      commitSuccess(created)
      setCustomerName('')
      setNotes('')
      setNotice(null)
      applyPaymentEvent({
        type: 'order_created',
        payable: isPayableOrder({ status: created.status }),
      })
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
    const current = successRef.current
    if (!current || claimLock.current || !idempotencyKeyRef.current) return

    claimLock.current = true
    setClaiming(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/public/table-orders/${current.order_id}/pay`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            buildTablePaymentClaimPayload({
              tableToken: table.token,
              idempotencyKey: idempotencyKeyRef.current,
            })
          ),
        }
      )
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
          const outcome = resolveClaimOutcome(current.status, claimed)
          commitSuccess({ ...current, status: outcome.status })
          applyPaymentEvent({ type: 'claim_conflict' })
          setError(null)
          setStep('success')
          return
        }
        if (res.status === 404) {
          // This order can never be claimed (the key does not match, or it is
          // not a table order). Hide the QR: a diner who already transferred
          // must not be handed a scannable code for an order that can never
          // take the money.
          applyPaymentEvent({ type: 'claim_not_found' })
          setError(
            'This order can no longer be paid online. If you have already made a transfer, please ask a staff member.'
          )
          return
        }
        // A 5xx or a gateway error can arrive AFTER the RPC committed. Re-read
        // the order instead of leaving a live QR next to an error — the diner
        // may already have transferred.
        const state = await reconcileAfterFailedClaim()
        if (state === 'payable') {
          setError(
            'Your payment was not recorded. You can try “I have paid” again, or pay at the counter.'
          )
        } else if (state === 'unconfirmed') {
          setError(
            'We could not confirm whether your payment was recorded. If you have already made a transfer, please do not pay again — ask a staff member to check.'
          )
        }
        return
      }

      const claim = parseTablePaymentClaim(data)
      if (!claim) {
        // The claim may have landed behind an unreadable body. Ask the server
        // what the order's real status is before letting the diner pay again.
        const state = await reconcileAfterFailedClaim()
        if (state === 'payable') {
          setError(
            'We could not read the server’s response. Your payment was not recorded — you can try “I have paid” again, or pay at the counter.'
          )
        } else if (state === 'unconfirmed') {
          setError(
            'We could not confirm whether your payment was recorded. If you have already made a transfer, please do not pay again — ask a staff member to check.'
          )
        }
        return
      }

      // Trust the flag as well as the status: an already-paid order can still
      // be `pending` if its payment row landed without the status bump. The
      // recorded method matters too — a cashier-settled order must not be
      // shown as "payment received" for a QR transfer that never landed.
      const outcome = resolveClaimOutcome(current.status, claim)
      commitSuccess({
        ...current,
        status: outcome.status,
        paid_at: claim.paid_at ?? current.paid_at ?? null,
        payment_method: claim.payment_method ?? current.payment_method ?? null,
        already_paid: claim.already_paid,
      })
      applyPaymentEvent({ type: 'claim_succeeded' })
      setNotice(null)
      setError(null)
      setStep('success')
    } catch {
      // The request may have landed: the phone switched to the banking app and
      // the response never came back. Re-read the order before leaving the
      // diner with a live QR on an order that is already paid.
      const state = await reconcileAfterFailedClaim()
      if (state === 'payable') {
        setError(
          'Network error — your payment was not recorded. You can try “I have paid” again, or pay at the counter.'
        )
      } else if (state === 'unconfirmed') {
        setError(
          'Network error — we could not confirm whether your payment was recorded. If you have already made a transfer, please do not pay again — ask a staff member to check.'
        )
      }
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
    applySuccess(null)
    setError(null)
    setNotice(null)
    applyPaymentEvent({ type: 'new_order' })
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
    // Fail closed: the QR returns only after a fresh server read confirms the
    // order is still pending and unpaid. The block is deliberately NOT cleared
    // here — a server that said "this can never be paid" keeps its say.
    applyPaymentEvent({ type: 'payment_step_entered' })
    setStep('payment')
  }

  if (step === 'success' && success) {
    return (
      <TableOrderSuccessView
        table={table}
        success={success}
        onOrderMore={startNewOrder}
        onPayByQr={payByQr}
        canPayByQr={paymentState.payable}
        onCheckStatus={checkStatus}
        checking={checking}
        notice={notice}
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
        blocked={paymentState.blocked}
        confirmed={paymentState.confirmed}
        onBack={() => {
          if (!claiming) {
            // The order already exists and the cart is cleared, so there is no
            // review to return to: back goes to the order's status screen.
            setError(null)
            // The confirmation does not travel out of the payment step: any
            // later visit has to earn it again with a fresh read.
            applyPaymentEvent({ type: 'payment_step_left' })
            setStep('success')
          }
        }}
        onClaim={claimPayment}
        onPayAtCounter={() => {
          // The order already reached the kitchen as `pending`; the cashier
          // collects at the counter as before.
          setError(null)
          applyPaymentEvent({ type: 'payment_step_left' })
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
