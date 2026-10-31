'use client'

/**
 * Presentational screens for the public table-QR page.
 *
 * They take every value as a prop and read no store or context, so the whole
 * flow can be asserted with `react-dom/server` in a node test environment.
 */

import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  QrCode,
  Receipt,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CompanyQrPanel } from '@/app/pos/components/CompanyQrPanel'
import { MAX_PAX, MIN_PAX } from '@/lib/pos/tables'
import { receiptPaymentLabel } from '@/lib/pos/receipt'
import { tablePaymentTone, type TablePaymentChoice } from '@/lib/pos/table-orders'
import type { PublicTable, TableOrderSuccess } from '@/lib/pos/types'

export function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/** One cart line, flattened so the view needs no store access. */
export interface TableOrderViewItem {
  /** Stable list key: item id + modifier ids. */
  key: string
  menuItemId: string
  name: string
  quantity: number
  lineTotalCents: number
  modifiers: { id: string; name: string; priceDeltaCents: number }[]
  notes: string
}

/* ── Review ─────────────────────────────────────────────────────────────── */

interface ReviewViewProps {
  table: PublicTable
  items: TableOrderViewItem[]
  pax: number | null
  subtotalCents: number
  customerName: string
  notes: string
  paymentChoice: TablePaymentChoice
  submitting: boolean
  error: string | null
  onBack: () => void
  onChangePax: (delta: number) => void
  onCustomerNameChange: (value: string) => void
  onNotesChange: (value: string) => void
  onPaymentChoiceChange: (choice: TablePaymentChoice) => void
  onUpdateQuantity: (item: TableOrderViewItem, quantity: number) => void
  onRemoveItem: (item: TableOrderViewItem) => void
  onSubmit: () => void
}

const PAYMENT_OPTIONS: {
  value: TablePaymentChoice
  label: string
  hint: string
}[] = [
  {
    value: 'qr',
    label: 'Pay now by QR',
    hint: 'Scan our DuitNow QR and show the receipt at the counter.',
  },
  {
    value: 'counter',
    label: 'Pay at counter',
    hint: 'Send the order now and settle the bill at the counter.',
  },
]

/**
 * Full-screen review step.
 *
 * Pax is required: the kitchen plans portions from it, so the order cannot be
 * sent until the diner has picked a number (`pax === null` disables the CTA).
 */
export function ReviewView({
  table,
  items,
  pax,
  subtotalCents,
  customerName,
  notes,
  paymentChoice,
  submitting,
  error,
  onBack,
  onChangePax,
  onCustomerNameChange,
  onNotesChange,
  onPaymentChoiceChange,
  onUpdateQuantity,
  onRemoveItem,
  onSubmit,
}: ReviewViewProps) {
  const canSubmit = pax !== null && items.length > 0 && !submitting

  return (
    <main className="min-h-dvh bg-background pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            aria-label="Back to menu"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-2 text-foreground transition hover:bg-surface-2 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Mad Krapow
            </p>
            <h1 className="truncate font-display text-lg font-extrabold text-foreground">
              Review your order
            </h1>
            <p className="text-[11px] text-muted-foreground">Table {table.label}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        <ul className="space-y-3 rounded-xl border border-border bg-surface p-3">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">
                  {item.quantity}× {item.name}
                </p>
                {item.modifiers.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {item.modifiers.map((modifier) => (
                      <li
                        key={modifier.id}
                        className="text-[11px] leading-4 text-amber-200"
                      >
                        + {modifier.name}
                        {modifier.priceDeltaCents > 0 && (
                          <span className="ml-1 tabular-nums text-amber-300/80">
                            (+{formatPrice(modifier.priceDeltaCents)})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {item.notes.trim() && (
                  <p className="mt-0.5 text-xs italic text-muted-foreground">
                    “{item.notes.trim()}”
                  </p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatPrice(item.lineTotalCents)}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item, item.quantity - 1)}
                  disabled={submitting}
                  aria-label={`Remove one ${item.name}`}
                  className="grid h-7 w-7 place-items-center rounded-full border border-border-2 text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item, item.quantity + 1)}
                  disabled={submitting}
                  aria-label={`Add one ${item.name}`}
                  className="grid h-7 w-7 place-items-center rounded-full border border-border-2 text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item)}
                  disabled={submitting}
                  aria-label={`Remove ${item.name}`}
                  className="grid h-7 w-7 place-items-center rounded-full text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Pax (required)
            </span>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChangePax(-1)}
                disabled={submitting || pax === null || pax <= MIN_PAX}
                aria-label="Fewer diners"
                className="grid h-8 w-8 place-items-center rounded-full border border-border-2 text-foreground hover:bg-surface-2 disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-6 text-center text-base font-extrabold tabular-nums text-foreground">
                {pax ?? '—'}
              </span>
              <button
                type="button"
                onClick={() => onChangePax(1)}
                disabled={submitting || (pax !== null && pax >= MAX_PAX)}
                aria-label="More diners"
                className="grid h-8 w-8 place-items-center rounded-full border border-border-2 text-foreground hover:bg-surface-2 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {pax === null && (
            <p className="mt-2 text-xs text-amber-300">
              Select the number of diners to continue
            </p>
          )}
        </div>

        <fieldset className="rounded-xl border border-border bg-surface p-3">
          <legend className="px-1 text-sm font-semibold text-foreground">
            Payment
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PAYMENT_OPTIONS.map((option) => {
              const selected = paymentChoice === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onPaymentChoiceChange(option.value)}
                  disabled={submitting}
                  aria-pressed={selected}
                  className={`rounded-xl border p-3 text-left transition disabled:opacity-40 ${
                    selected
                      ? 'border-primary bg-primary/10'
                      : 'border-border-2 hover:bg-surface-2'
                  }`}
                >
                  <span className="block text-sm font-bold text-foreground">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                    {option.hint}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label
            htmlFor="table-customer-name"
            className="text-sm font-semibold text-foreground"
          >
            Name (optional)
          </label>
          <Input
            id="table-customer-name"
            value={customerName}
            onChange={(event) => onCustomerNameChange(event.target.value)}
            disabled={submitting}
            placeholder="So we can call your order"
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="table-order-notes"
            className="text-sm font-semibold text-foreground"
          >
            Notes (optional)
          </label>
          <textarea
            id="table-order-notes"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            disabled={submitting}
            placeholder="Allergies, preferences…"
            maxLength={500}
            rows={2}
            className="w-full resize-none rounded-lg border border-border-2 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
          >
            {error}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">Total</span>
            <span className="text-xl font-extrabold tabular-nums text-ember-text">
              {formatPrice(subtotalCents)}
            </span>
          </div>
          <Button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="min-h-12 w-full rounded-full text-[15px] font-bold"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `${paymentChoice === 'qr' ? 'Continue to payment' : 'Send order'} · ${formatPrice(subtotalCents)}`
            )}
          </Button>
        </div>
      </div>
    </main>
  )
}

/* ── Payment ────────────────────────────────────────────────────────────── */

interface PaymentViewProps {
  table: PublicTable
  success: TableOrderSuccess
  claiming: boolean
  error: string | null
  /**
   * True when the order can never be paid from this phone (the server said so).
   *
   * The QR is hidden: a diner who already transferred must not be handed a
   * scannable code for an order that can never take the money.
   */
  blocked?: boolean
  onBack: () => void
  onClaim: () => void
  onPayAtCounter: () => void
}

const DINER_QR_INSTRUCTION =
  'Scan with any Malaysian banking app, pay the exact amount, then tap I have paid.'

/**
 * The pay-by-QR step.
 *
 * The amount comes from the create response's server total — never from the
 * cart — so what the diner scans is what the kitchen will charge.
 */
export function PaymentView({
  table,
  success,
  claiming,
  error,
  blocked = false,
  onBack,
  onClaim,
  onPayAtCounter,
}: PaymentViewProps) {
  return (
    <main className="min-h-dvh bg-background pb-12">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            disabled={claiming}
            aria-label="Back to order status"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border-2 text-foreground transition hover:bg-surface-2 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Mad Krapow
            </p>
            <h1 className="truncate font-display text-lg font-extrabold text-foreground">
              Pay by QR
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Table {table.label} · Order {success.display_code ?? success.order_number}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-5">
        {!blocked && (
          <CompanyQrPanel
            amountCents={success.total_cents}
            instruction={DINER_QR_INSTRUCTION}
          />
        )}

        {blocked && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            This order cannot be paid from this phone. Please ask a staff member
            to settle the bill.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
          >
            {error}
          </p>
        )}

        {!blocked && (
          <Button
            onClick={onClaim}
            disabled={claiming}
            className="min-h-12 w-full rounded-full text-[15px] font-bold"
          >
            {claiming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Recording your payment…
              </>
            ) : (
              'I have paid'
            )}
          </Button>
        )}

        <button
          type="button"
          onClick={onPayAtCounter}
          disabled={claiming}
          className="w-full rounded-full py-2 text-center text-xs font-semibold text-muted-foreground underline underline-offset-4 transition hover:text-foreground disabled:opacity-40"
        >
          Pay at the counter instead
        </button>
      </div>
    </main>
  )
}

/* ── Success ────────────────────────────────────────────────────────────── */

interface TableOrderSuccessViewProps {
  table: PublicTable
  success: TableOrderSuccess
  onOrderMore: () => void
  /** Enter the QR payment step from a pending order. */
  onPayByQr?: () => void
  /**
   * True when the SERVER confirmed the order is still pending and unpaid.
   *
   * The payment button is hidden unless this is true: a stale snapshot must
   * not put a live QR on an order that is already paid, or the diner scans it
   * and transfers the money a second time.
   */
  canPayByQr?: boolean
  /** Re-read the order's status from the server. */
  onCheckStatus?: () => void
  checking?: boolean
  /** A standing message for this screen (e.g. a duplicate order). */
  notice?: string | null
}

/**
 * The confirmation screen.
 *
 * Branches on the order's real status and the recorded payment method, not on
 * the payment choice: a paid order gets the receipt link the diner shows the
 * cashier, a pending one is told to pay at the counter, and a cancelled one
 * says so. Only the paid allowlist may render "Payment received" — a status
 * this module has not seen is not proof of payment, and an order paid by a
 * cashier is not proof that this diner's QR transfer landed.
 */
export function TableOrderSuccessView({
  table,
  success,
  onOrderMore,
  onPayByQr,
  canPayByQr = false,
  onCheckStatus,
  checking = false,
  notice = null,
}: TableOrderSuccessViewProps) {
  const tone = tablePaymentTone({
    status: success.status,
    paymentMethod: success.payment_method,
  })
  const paid = tone === 'paid_by_qr' || tone === 'paid_elsewhere'
  const cancelled = tone === 'cancelled'
  const showPay = canPayByQr && !paid && !cancelled
  const receiptHref = `/t/${table.token}/receipt/${success.order_id}`
  const methodLabel = receiptPaymentLabel(success.payment_method ?? null)

  const title =
    tone === 'paid_by_qr'
      ? 'Payment received'
      : tone === 'paid_elsewhere'
        ? `Already paid by ${methodLabel}`
        : cancelled
          ? 'Order cancelled'
          : 'Order sent to the kitchen'

  const detail =
    tone === 'paid_by_qr'
      ? 'Show the receipt at the counter if the cashier asks. Keep this code to collect your order.'
      : tone === 'paid_elsewhere'
        ? 'This order was already settled. If you have made a transfer, please check with a staff member — do not pay again.'
        : cancelled
          ? 'This order was cancelled. Please ask a staff member if you were charged.'
          : showPay
            ? 'Pay at the counter. Keep this code to collect your order.'
            : 'Please ask a staff member to settle this order.'

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" />
        <h1 className="mt-4 font-display text-2xl font-extrabold text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Table {table.label}
          {success.pax ? ` · ${success.pax} pax` : ''}
        </p>

        {notice && (
          <p
            role="status"
            className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            {notice}
          </p>
        )}

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
          {detail}
        </p>

        {/* A pending order can still be paid from the phone: a diner who chose
            "pay at counter" on review, or one whose page was reloaded before
            they paid, must not be stranded. The button appears only once the
            server has confirmed the order is still payable. */}
        {showPay && onPayByQr && (
          <Button
            onClick={onPayByQr}
            className="mt-4 min-h-11 w-full rounded-full font-bold"
          >
            <QrCode className="h-4 w-4" />
            Pay now by QR
          </Button>
        )}

        {!paid && !cancelled && !showPay && onCheckStatus && (
          <Button
            onClick={onCheckStatus}
            disabled={checking}
            variant="outline"
            className="mt-4 min-h-11 w-full rounded-full font-bold"
          >
            {checking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking…
              </>
            ) : (
              'Check order status'
            )}
          </Button>
        )}

        <Button
          asChild
          variant={paid ? 'default' : 'outline'}
          className="mt-3 min-h-11 w-full rounded-full font-bold"
        >
          <a href={receiptHref}>
            <Receipt className="h-4 w-4" />
            {paid ? 'Show receipt' : 'Open receipt'}
          </a>
        </Button>

        <Button
          onClick={onOrderMore}
          variant="outline"
          className="mt-3 min-h-11 w-full rounded-full font-bold"
        >
          Order more
        </Button>
      </div>
    </main>
  )
}
