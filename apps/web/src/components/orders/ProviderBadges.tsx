import { Banknote, Bike, CreditCard, Hourglass, Store, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getDeliveryBadge,
  getPaymentBadge,
  type DeliveryProvider,
  type PaymentProvider,
  type ProviderSourceFields,
} from "@/lib/orders/providers"

const PAYMENT_STYLE: Record<PaymentProvider, { className: string; Icon: typeof CreditCard }> = {
  stripe: {
    className: "bg-violet-500/15 text-violet-400 border-violet-500/30",
    Icon: CreditCard,
  },
  cash: {
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Icon: Banknote,
  },
  pending: {
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    Icon: Hourglass,
  },
}

const DELIVERY_STYLE: Record<DeliveryProvider, { className: string; Icon: typeof Truck }> = {
  lalamove: {
    className: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    Icon: Truck,
  },
  self_pickup: {
    className: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    Icon: Store,
  },
  in_house: {
    className: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    Icon: Bike,
  },
  pending: {
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    Icon: Hourglass,
  },
}

export type ProviderBadgeSize = "xs" | "sm" | "md"

const SIZE_CLASS: Record<ProviderBadgeSize, string> = {
  xs: "text-[10px] h-4 px-1.5 gap-0.5 [&_svg]:h-2.5 [&_svg]:w-2.5",
  sm: "text-[11px] h-5 px-2 gap-1 [&_svg]:h-3 [&_svg]:w-3",
  md: "text-xs h-6 px-2.5 gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5",
}

interface ProviderBadgesProps {
  order: ProviderSourceFields
  size?: ProviderBadgeSize
  className?: string
  showLabels?: boolean
}

export function ProviderBadges({
  order,
  size = "sm",
  className,
  showLabels = true,
}: ProviderBadgesProps) {
  const payment = getPaymentBadge(order)
  const delivery = getDeliveryBadge(order)
  const paymentStyle = PAYMENT_STYLE[payment.provider]
  const deliveryStyle = DELIVERY_STYLE[delivery.provider]
  const sizeClass = SIZE_CLASS[size]

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      <span
        className={cn(
          "inline-flex items-center rounded-full border font-medium tabular-nums shrink-0",
          sizeClass,
          paymentStyle.className,
        )}
        title={`Payment: ${payment.label}`}
        aria-label={`Payment provider: ${payment.label}`}
      >
        <paymentStyle.Icon aria-hidden />
        {showLabels && payment.label}
      </span>
      <span
        className={cn(
          "inline-flex items-center rounded-full border font-medium tabular-nums shrink-0",
          sizeClass,
          deliveryStyle.className,
        )}
        title={`Delivery: ${delivery.label}`}
        aria-label={`Delivery provider: ${delivery.label}`}
      >
        <deliveryStyle.Icon aria-hidden />
        {showLabels && delivery.label}
      </span>
    </div>
  )
}
