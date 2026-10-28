import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase/server'
import {
  isClaimedByDiner,
  receiptPaymentLabel,
  receiptStatus,
} from '@/lib/pos/receipt'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Receipt — Mad Krapow',
  // Table QR links are private capability URLs; keep them out of search.
  robots: { index: false, follow: false },
}

interface ReceiptPageProps {
  params: Promise<{ token: string; orderId: string }>
}

interface ReceiptModifier {
  modifier_name: string
  modifier_price_delta_cents: number
}

interface ReceiptItem {
  menu_item_name: string
  quantity: number
  line_total_cents: number
  notes: string | null
  order_item_modifiers: ReceiptModifier[] | null
}

interface ReceiptPayment {
  method: string | null
  status: string
  paid_at: string | null
  raw: unknown
}

interface ReceiptOrder {
  id: string
  display_code: string | null
  order_number: string
  status: string
  subtotal_cents: number
  total_cents: number
  pax: number | null
  table_label: string | null
  payment_method: string | null
  created_at: string
  order_items: ReceiptItem[] | null
  payments: ReceiptPayment[] | null
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/** MYT (UTC+8) — the restaurant's clock, regardless of server TZ. */
function formatTimestamp(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 8 * 3600_000)
  return shifted.toISOString().slice(0, 16).replace('T', ' ') + ' MYT'
}

/**
 * The diner's durable receipt for a table order.
 *
 * Resolved server-side with the service-role client and scoped to the token's
 * table, so holding an order id alone reveals nothing: a diner can only read
 * receipts for the table whose QR they scanned. Printable by design (black on
 * white, no fixed overlays) so it can be shown to the cashier at the counter.
 */
export default async function TableReceiptPage({ params }: ReceiptPageProps) {
  const { token, orderId } = await params

  if (!token || token.length < 16 || token.length > 128) {
    notFound()
  }
  // Seeded ids are UUID-shaped but not RFC 4122 v4; `z.guid()` accepts any
  // 8-4-4-4-12 hex shape and the query still enforces membership.
  if (!z.guid().safeParse(orderId).success) {
    notFound()
  }

  const supabase = getServiceClient()

  const { data: table } = await supabase
    .from('restaurant_tables')
    .select('id, is_active')
    .eq('qr_token', token)
    .maybeSingle()

  if (!table || !table.is_active) {
    notFound()
  }

  const { data: order } = await supabase
    .from('orders')
    .select(
      'id, display_code, order_number, status, subtotal_cents, total_cents, pax, table_label, payment_method, created_at, order_items(menu_item_name, quantity, line_total_cents, notes, order_item_modifiers(modifier_name, modifier_price_delta_cents)), payments(method, status, paid_at, raw)'
    )
    .eq('id', orderId)
    .eq('table_id', table.id)
    .maybeSingle()

  if (!order) {
    notFound()
  }

  const receipt = order as unknown as ReceiptOrder
  const items = receipt.order_items ?? []
  const payment =
    (receipt.payments ?? []).find((row) => row.status === 'succeeded') ??
    (receipt.payments ?? [])[0] ??
    null
  const status = receiptStatus(receipt.status)

  const badge =
    status === 'paid'
      ? { label: 'PAID', className: 'bg-emerald-600 text-white' }
      : status === 'cancelled'
        ? { label: 'CANCELLED', className: 'bg-red-700 text-white' }
        : { label: 'PAY AT COUNTER', className: 'bg-amber-500 text-black' }

  const method = receiptPaymentLabel(
    payment?.method ?? receipt.payment_method ?? null
  )

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-white px-5 py-8 text-black">
      <header className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
          Mad Krapow
        </p>
        <h1 className="mt-1 font-display text-xl font-extrabold">Receipt</h1>
        <p className="mt-1 text-xs text-neutral-600">
          {receipt.table_label ? `Table ${receipt.table_label}` : 'Dine-in'}
          {receipt.pax ? ` · ${receipt.pax} pax` : ''}
        </p>
      </header>

      <div className="mt-4 flex items-center justify-between border-y border-dashed border-neutral-300 py-2 text-xs">
        <div>
          <p className="font-semibold">
            #{receipt.display_code ?? receipt.order_number}
          </p>
          <p className="text-neutral-600">{formatTimestamp(receipt.created_at)}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <ul className="mt-4 space-y-3 text-sm">
        {items.map((item, index) => (
          <li key={`${item.menu_item_name}-${index}`}>
            <div className="flex items-start justify-between gap-3">
              <span className="font-medium">
                {item.quantity}× {item.menu_item_name}
              </span>
              <span className="tabular-nums">
                {formatPrice(item.line_total_cents)}
              </span>
            </div>
            {(item.order_item_modifiers ?? []).map((modifier, modifierIndex) => (
              <p
                key={`${modifier.modifier_name}-${modifierIndex}`}
                className="pl-4 text-xs text-neutral-600"
              >
                + {modifier.modifier_name}
                {modifier.modifier_price_delta_cents
                  ? ` (${formatPrice(modifier.modifier_price_delta_cents)})`
                  : ''}
              </p>
            ))}
            {item.notes && (
              <p className="pl-4 text-xs italic text-neutral-500">{item.notes}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-1 border-t border-neutral-300 pt-3 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatPrice(receipt.subtotal_cents)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-300 pt-1 font-extrabold">
          <span>Total</span>
          <span className="tabular-nums">{formatPrice(receipt.total_cents)}</span>
        </div>
      </div>

      {status === 'paid' && (
        <div className="mt-4 rounded-lg bg-neutral-100 p-3 text-xs">
          <p>
            <span className="font-semibold">Paid by </span>
            {method}
            {payment?.paid_at ? ` · ${formatTimestamp(payment.paid_at)}` : ''}
          </p>
          {isClaimedByDiner(payment?.raw) && (
            <p className="mt-1 font-medium text-neutral-700">
              Paid by QR — claimed by the diner. Cashier: please verify the bank
              transfer.
            </p>
          )}
        </div>
      )}

      <p className="mt-auto pt-6 text-center text-[11px] text-neutral-500">
        Show this receipt to the cashier.
      </p>
    </main>
  )
}
