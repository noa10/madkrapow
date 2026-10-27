'use client'

import {
  Banknote,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  QrCode,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { posLineTotalCents, type PosCartModifier } from '@/lib/pos/cart'
import { MAX_PAX, MIN_PAX } from '@/lib/pos/tables'
import type { PosSettleTarget, RestaurantTable, TableSummary } from '@/lib/pos/types'
import type { PosMenuItem } from '../hooks/usePosData'

export type PosOrderType = 'dine_in' | 'take_away'
export type PosPaymentMethod = 'cash' | 'qr_pay'
export type PosPaymentTiming = 'pay_now' | 'pay_later'

export interface PosCartLine {
  key: string
  item: PosMenuItem
  quantity: number
  modifiers: PosCartModifier[]
  notes: string
}

interface PosSalePanelProps {
  orderType: PosOrderType
  onOrderTypeChange: (type: PosOrderType) => void
  tables: RestaurantTable[]
  summaries: ReadonlyMap<string, TableSummary>
  selectedTableId: string | null
  onSelectTable: (id: string) => void
  pax: number
  onPaxChange: (pax: number) => void
  customerName: string
  onCustomerNameChange: (name: string) => void
  /** Grouped unpaid total at the selected table, if any. */
  pendingTarget: PosSettleTarget | null
  onCollectUnpaid: (target: PosSettleTarget) => void
  cart: PosCartLine[]
  onChangeQuantity: (lineKey: string, delta: number) => void
  onRemove: (lineKey: string) => void
  onClear: () => void
  paymentMethod: PosPaymentMethod
  onPaymentMethodChange: (method: PosPaymentMethod) => void
  paymentTiming: PosPaymentTiming
  onPaymentTimingChange: (timing: PosPaymentTiming) => void
  totalCents: number
  submitting: boolean
  onSubmit: () => void
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

const PAYMENT_OPTIONS: { value: PosPaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'qr_pay', label: 'Company QR', icon: QrCode },
]

/** Right-hand "current sale" panel for dine-in and take-away POS orders. */
export function PosSalePanel({
  orderType,
  onOrderTypeChange,
  tables,
  summaries,
  selectedTableId,
  onSelectTable,
  pax,
  onPaxChange,
  customerName,
  onCustomerNameChange,
  pendingTarget,
  onCollectUnpaid,
  cart,
  onChangeQuantity,
  onRemove,
  onClear,
  paymentMethod,
  onPaymentMethodChange,
  paymentTiming,
  onPaymentTimingChange,
  totalCents,
  submitting,
  onSubmit,
}: PosSalePanelProps) {
  const selectedTable = selectedTableId
    ? tables.find((table) => table.id === selectedTableId)
    : null
  const canSubmit =
    cart.length > 0 &&
    !submitting &&
    (orderType === 'take_away' || Boolean(selectedTableId)) &&
    (orderType === 'dine_in' || customerName.trim().length > 0)

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 border-t border-white/10 p-3 lg:h-screen lg:w-96 lg:border-l lg:border-t-0">
      {/* Sale type */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onOrderTypeChange('dine_in')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition',
            orderType === 'dine_in'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'
          )}
        >
          <UtensilsCrossed className="h-4 w-4" />
          Dine-in
        </button>
        <button
          type="button"
          onClick={() => onOrderTypeChange('take_away')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition',
            orderType === 'take_away'
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'
          )}
        >
          <ShoppingBag className="h-4 w-4" />
          Take-away
        </button>
      </div>

      {orderType === 'dine_in' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Table
            </span>
            {selectedTable && (
              <span className="text-xs font-semibold text-foreground">
                {selectedTable.label}
                {selectedTable.zone ? ` · ${selectedTable.zone}` : ''}
              </span>
            )}
          </div>

          {tables.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground">
              No active tables yet. Add them in Admin → Tables.
            </p>
          ) : (
            <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
              {tables.map((table) => {
                const summary = summaries.get(table.id)
                const occupied = summary?.isOccupied ?? false
                const selected = selectedTableId === table.id
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => onSelectTable(table.id)}
                    className={cn(
                      'relative rounded-lg border px-1 py-2 text-center transition',
                      selected
                        ? 'border-primary bg-primary/20 text-foreground'
                        : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'
                    )}
                  >
                    <span className="block truncate text-xs font-bold">{table.label}</span>
                    <span className="mt-0.5 block text-[10px]">
                      {occupied ? 'Occupied' : `${table.seats} seats`}
                    </span>
                    {occupied && (
                      <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span className="text-xs font-semibold text-muted-foreground">Pax</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPaxChange(Math.max(MIN_PAX, pax - 1))}
                disabled={pax <= MIN_PAX}
                aria-label="Fewer diners"
                className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-foreground hover:bg-white/10 disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-6 text-center text-base font-extrabold tabular-nums text-foreground">
                {pax}
              </span>
              <button
                type="button"
                onClick={() => onPaxChange(Math.min(MAX_PAX, pax + 1))}
                disabled={pax >= MAX_PAX}
                aria-label="More diners"
                className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-foreground hover:bg-white/10 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {pendingTarget && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                  Unpaid at this table
                </p>
                <p className="truncate text-[11px] leading-4 text-amber-200/90">
                  {pendingTarget.context} · {formatPrice(pendingTarget.amountCents)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCollectUnpaid(pendingTarget)}
                className="shrink-0 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-bold text-amber-200 transition hover:bg-amber-400/20"
              >
                Collect
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="pos-customer-name" className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Customer name
          </label>
          <Input
            id="pos-customer-name"
            value={customerName}
            onChange={(event) => onCustomerNameChange(event.target.value)}
            placeholder="Name for the order"
            className="h-9 bg-white/5"
            maxLength={120}
          />
        </div>
      )}

      {/* Cart */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            Current sale
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-semibold text-muted-foreground hover:text-red-400"
            >
              Clear
            </button>
          )}
        </div>

        {cart.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-muted-foreground">
            Tap dishes to add them.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {cart.map((line) => (
              <li
                key={line.key}
                className="flex items-start justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {line.item.name}
                  </div>
                  {line.modifiers.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5">
                      {line.modifiers.map((modifier) => (
                        <li
                          key={modifier.id}
                          className="flex items-start gap-1 text-[11px] leading-4 text-amber-200"
                        >
                          <span aria-hidden className="mt-px shrink-0">
                            +
                          </span>
                          <span className="break-words">
                            {modifier.name}
                            {modifier.price_delta_cents > 0 && (
                              <span className="ml-1 tabular-nums text-amber-300/80">
                                (+RM {(modifier.price_delta_cents / 100).toFixed(2)})
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {line.notes && (
                    <div className="mt-0.5 break-words text-[11px] italic leading-4 text-muted-foreground">
                      “{line.notes}”
                    </div>
                  )}
                  <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {formatPrice(
                      posLineTotalCents(
                        line.item.price_cents,
                        line.modifiers,
                        line.quantity
                      )
                    )}
                  </div>
                </div>
                <div className="mt-0.5 flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(line.key, -1)}
                    aria-label={`Remove one ${line.item.name}`}
                    className="rounded p-1 hover:bg-white/10"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center text-sm tabular-nums text-foreground">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChangeQuantity(line.key, 1)}
                    aria-label={`Add one ${line.item.name}`}
                    className="rounded p-1 hover:bg-white/10"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(line.key)}
                    aria-label={`Remove ${line.item.name}`}
                    className="rounded p-1 text-red-400 hover:bg-white/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Payment + submit */}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {(['pay_now', 'pay_later'] as const).map((timing) => (
            <button
              key={timing}
              type="button"
              onClick={() => onPaymentTimingChange(timing)}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs font-bold transition',
                paymentTiming === timing
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'
              )}
            >
              {timing === 'pay_now' ? 'Pay now' : 'Pay later'}
            </button>
          ))}
        </div>

        {paymentTiming === 'pay_now' ? (
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_OPTIONS.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onPaymentMethodChange(option.value)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition',
                    paymentMethod === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {option.label}
                </button>
              )
            })}
            <button
              type="button"
              disabled
              title="Card terminal integration is coming soon"
              className="col-span-2 flex cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-muted-foreground/60"
            >
              <CreditCard className="h-4 w-4" />
              Card terminal — coming soon
            </button>
          </div>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-amber-300">
            The kitchen docket prints now; the receipt prints when payment is
            collected from the{' '}
            {orderType === 'dine_in' ? 'table board' : 'Unpaid take-away list'}.
          </p>
        )}

        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-xl font-extrabold tabular-nums text-foreground">
            {formatPrice(totalCents)}
          </span>
        </div>

        <Button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="min-h-11 w-full text-[15px] font-bold"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : paymentTiming === 'pay_later' ? (
            'Send to kitchen · Pay later'
          ) : (
            `Charge ${formatPrice(totalCents)}`
          )}
        </Button>
      </div>
    </aside>
  )
}
