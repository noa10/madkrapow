"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { InlineSpinner } from "@/components/ui/InlineSpinner"
import { ConfirmModal } from "@/components/ui/ConfirmModal"
import { cn } from "@/lib/utils"
import { getOrderDisplayCode } from "@/lib/utils/order-code"
import { getOrderUrgencyNow, type UrgencyTier } from "@/lib/orders/urgency"
import { formatMoney } from "@/lib/orders/money"
import { getPaymentPill } from "@/lib/orders/payment-pill"
import { adminLabel, parseOrderStatus } from "@/lib/orders/status"
import { useOrderStatusTransition } from "@/app/admin/orders/hooks/useOrderStatusTransition"
import { OrderOverflowMenu } from "./OrderOverflowMenu"
import {
  SOURCE_PILL_CLASSES,
  getSourceLabel,
  getFulfillmentLabel,
} from "./order-source"
import type { Order } from "@/types/orders"

/**
 * Dark-theme text-pill classes per status. `lib/orders/status.ts` only ships
 * light-mode role classes (`bg-orange-100 …`), so the dark palette lives here.
 */
const STATUS_PILL_CLASSES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paid: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  accepted: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  preparing: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  ready: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  picked_up: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  delivered: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
}

const STATUS_PILL_FALLBACK = "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"

const TIER_TEXT: Record<UrgencyTier, string> = {
  fresh: "text-emerald-400",
  warning: "text-amber-400",
  late: "text-red-400",
}

function TextPill({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className
      )}
    >
      {children}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  return (
    <TextPill className={STATUS_PILL_CLASSES[status] ?? STATUS_PILL_FALLBACK}>
      {adminLabel(parseOrderStatus(status))}
    </TextPill>
  )
}

function PaymentPillView({ pill }: { pill: ReturnType<typeof getPaymentPill> }) {
  const label =
    pill.state === "paid" && pill.method ? `${pill.label} · ${pill.method}` : pill.label

  return (
    <TextPill
      className={
        pill.state === "unpaid"
          ? "border-amber-500/40 bg-amber-500/5 text-amber-400"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      }
    >
      {label}
    </TextPill>
  )
}

function SourcePill({ order }: { order: Order }) {
  return (
    <TextPill className={SOURCE_PILL_CLASSES[order.source] ?? SOURCE_PILL_CLASSES.web}>
      {getSourceLabel(order.source)}
    </TextPill>
  )
}

function MetaBadges({ order }: { order: Order }) {
  return (
    <>
      {order.fulfillment_type === "scheduled" && (
        <TextPill className="border-white/15 text-muted-foreground">Scheduled</TextPill>
      )}
      {order.order_kind === "bulk" && (
        <TextPill className="border-purple-500/30 bg-purple-500/10 text-purple-400">
          Bulk
        </TextPill>
      )}
      {order.dispatch_status === "failed" && (
        <TextPill className="border-red-500/30 bg-red-500/10 text-red-400">
          Dispatch Failed
        </TextPill>
      )}
    </>
  )
}

/**
 * Clock time is the primary label; the elapsed chip is small and secondary,
 * and only shown for today's orders (otherwise the full date carries the row).
 */
function TimePresence({ createdAt }: { createdAt: string }) {
  const urgency = getOrderUrgencyNow(createdAt)
  if (!urgency.valid) return null

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="tabular-nums text-foreground/80">{urgency.timestampLabel}</span>
      {urgency.isToday && (
        <span className={cn("tabular-nums text-[11px]", TIER_TEXT[urgency.tier])}>
          {urgency.elapsedLabel} ago
        </span>
      )}
    </div>
  )
}

function CustomerLine({
  order,
  onOpenItems,
}: {
  order: Order
  onOpenItems?: (order: Order) => void
}) {
  const count = order.item_count
  const label = count != null ? `${count} ${count === 1 ? "item" : "items"}` : null

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-sm text-foreground">{order.customer_name || "Guest"}</span>
      {label && (
        <>
          <span className="shrink-0 text-muted-foreground/40">•</span>
          {onOpenItems ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenItems(order)
              }}
              className="shrink-0 rounded text-xs text-muted-foreground/70 underline-offset-2 transition-colors hover:text-gold hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/40"
            >
              {label}
            </button>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground/60">{label}</span>
          )}
        </>
      )}
    </div>
  )
}

interface OrderCardProps {
  order: Order
  onStatusChange?: (newStatus: string) => void
  onOpenItems?: (order: Order) => void
}

export function OrderCard({ order, onStatusChange, onOpenItems }: OrderCardProps) {
  const router = useRouter()
  const {
    effectiveStatus,
    primaryAction,
    isTerminal,
    canCancel,
    isLoading,
    pendingTarget,
    modal,
    openCancel,
    handleForwardAction,
    confirmModal,
    closeModal,
    modalLoading,
  } = useOrderStatusTransition({
    orderId: order.id,
    currentStatus: order.status,
    createdAt: order.created_at,
    onStatusChange,
  })

  const displayCode = getOrderDisplayCode(order)
  const total = formatMoney((order.total_cents ?? 0) + (order.delivery_fee_cents ?? 0))
  const paymentPill = getPaymentPill(order)

  // The confirmation must not promise a refund for an order that was never paid.
  const cancelDescription =
    paymentPill.state === "unpaid"
      ? "This order is not paid. Cancelling will close it with nothing to refund."
      : "This order is paid. Cancelling will issue a refund."

  const handleCardClick = () => {
    router.push(`/admin/orders/${order.id}`)
  }

  const handleCta = (e: React.MouseEvent) => {
    e.stopPropagation()
    handleForwardAction()
  }

  const ctaNode =
    primaryAction && !isTerminal ? (
      <Button
        size="sm"
        onClick={handleCta}
        disabled={isLoading}
        className="h-11 w-full text-sm font-semibold md:h-8 md:w-auto md:px-3 md:text-xs"
      >
        {pendingTarget === primaryAction.nextStatus && <InlineSpinner size="sm" />}
        <span className="hidden md:inline">{primaryAction.label}</span>
        <span className="md:hidden">{primaryAction.shortLabel}</span>
      </Button>
    ) : null

  const overflowNode = (
    <OrderOverflowMenu
      order={order}
      onOpenItems={onOpenItems}
      onCancel={openCancel}
      canCancel={canCancel}
      disabled={isLoading}
    />
  )

  return (
    <>
      {/* Card-level click is a mouse convenience only: the order code is a real
          link, so keyboard users get one meaningful stop per card instead of a
          focusable wrapper (with `role="button"`) that contains other buttons. */}
      <div
        onClick={handleCardClick}
        className={cn(
          "group w-full cursor-pointer rounded-xl border border-white/8 bg-card/60 backdrop-blur-sm",
          "transition-all duration-200 hover:border-gold/20 hover:bg-card",
          "active:bg-card/80 active:scale-[0.995]",
          "animate-fade-in-up"
        )}
      >
        {/* Desktop — strict 3-zone layout */}
        <div className="hidden items-center gap-4 p-3 md:flex">
          {/* Left zone: code, status, fulfillment/source, time */}
          <div className="flex min-w-[176px] shrink-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/orders/${order.id}`}
                prefetch={false}
                onClick={(e) => e.stopPropagation()}
                aria-label={`View order ${displayCode}`}
                className="rounded text-lg font-bold tracking-wide text-gold tabular-nums underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
              >
                {displayCode}
              </Link>
              <StatusPill status={effectiveStatus} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <TextPill className="border-white/15 text-muted-foreground">
                {getFulfillmentLabel(order)}
              </TextPill>
              <SourcePill order={order} />
            </div>
            <TimePresence createdAt={order.created_at} />
          </div>

          {/* Middle zone: customer + items, payment + badges */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <CustomerLine order={order} onOpenItems={onOpenItems} />
            <div className="flex flex-wrap items-center gap-1.5">
              <PaymentPillView pill={paymentPill} />
              <MetaBadges order={order} />
            </div>
          </div>

          {/* Right zone: total, CTA, overflow */}
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-base font-semibold tabular-nums text-foreground">{total}</span>
            {ctaNode}
            {overflowNode}
          </div>
        </div>

        {/* Mobile — stacked card */}
        <div className="flex flex-col gap-2.5 p-3 md:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href={`/admin/orders/${order.id}`}
                prefetch={false}
                onClick={(e) => e.stopPropagation()}
                aria-label={`View order ${displayCode}`}
                className="rounded text-lg font-bold tracking-wide text-gold tabular-nums underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
              >
                {displayCode}
              </Link>
              <StatusPill status={effectiveStatus} />
            </div>
            <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">
              {total}
            </span>
          </div>

          <CustomerLine order={order} onOpenItems={onOpenItems} />

          <div className="flex flex-wrap items-center gap-1.5">
            <PaymentPillView pill={paymentPill} />
            <SourcePill order={order} />
            <TextPill className="border-white/15 text-muted-foreground">
              {getFulfillmentLabel(order)}
            </TextPill>
            <MetaBadges order={order} />
          </div>

          <TimePresence createdAt={order.created_at} />

          <div className="mt-0.5 flex items-center gap-2">
            {ctaNode}
            {overflowNode}
          </div>
        </div>
      </div>

      {/* Modals driven by the shared transition hook */}
      {modal?.type === "cancel" && (
        <ConfirmModal
          open
          onClose={closeModal}
          title="Cancel this order?"
          description={cancelDescription}
          confirmLabel="Cancel Order"
          cancelLabel="Go Back"
          variant="danger"
          loading={modalLoading}
          requireNote
          noteMinLength={10}
          notePlaceholder="Reason for cancellation (min 10 chars)..."
          onConfirm={confirmModal}
        />
      )}

      {modal?.type === "ready-warning" && (
        <ConfirmModal
          open
          onClose={closeModal}
          title="Order placed less than 5 minutes ago"
          description="This order was just placed. Notify delivery provider now?"
          confirmLabel="Mark Ready"
          cancelLabel="Wait"
          variant="warning"
          loading={modalLoading}
          onConfirm={confirmModal}
        />
      )}
    </>
  )
}
