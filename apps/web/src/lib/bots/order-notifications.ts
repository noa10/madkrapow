import { sendTelegramMessage } from '@/lib/bots/telegram'
import { sendWhatsAppTextMessage } from '@/lib/bots/whatsapp'
import { getCustomerForOrder } from '@/lib/bots/customer'
import {
  NOTIFY_STATUSES,
  parseOrderStatus,
  type OrderStatus,
} from '@/lib/orders/status'
import { createServerClient } from '@supabase/ssr'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('[OrderNotifications] Missing Supabase env vars')
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {},
    },
  })
}

const STATUS_MESSAGE_TEMPLATES: Record<OrderStatus, ((n: string) => string) | null> = {
  pending: null,
  paid: null,
  accepted: null,
  preparing: (n) => `✅ Your order #${n} is now being prepared!`,
  ready: (n) => `🍽️ Your order #${n} is ready for pickup/delivery!`,
  picked_up: (n) => `🚚 Your order #${n} has been picked up by the driver!`,
  delivered: (n) => `🎉 Your order #${n} has been delivered! Enjoy your meal!`,
  cancelled: (n) => `❌ Your order #${n} has been cancelled.`,
}

/**
 * Build the customer-facing message for a status, or `null` if the status
 * is suppressed (pending/paid/accepted) or unknown. Exported for testing
 * the allowlist.
 */
export function getStatusMessage(
  orderNumber: string,
  newStatus: string,
): string | null {
  const parsed = parseOrderStatus(newStatus)
  if (parsed === 'unknown') return null
  if (!NOTIFY_STATUSES.has(parsed)) return null
  const builder = STATUS_MESSAGE_TEMPLATES[parsed]
  return builder ? builder(orderNumber) : null
}

/**
 * Send a customer status update via Telegram or WhatsApp. Best-effort:
 * errors are logged but never thrown. Returns early without dispatching for
 * suppressed (`pending`/`paid`/`accepted`) or unknown statuses.
 */
export async function sendOrderStatusNotification(
  orderId: string,
  newStatus: string,
): Promise<void> {
  try {
    const parsed = parseOrderStatus(newStatus)
    if (parsed === 'unknown' || !NOTIFY_STATUSES.has(parsed)) {
      return
    }

    const supabase = getServiceClient()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_number, source')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error(
        '[OrderNotifications] Order not found for status notify:',
        orderId,
        orderError,
      )
      return
    }

    if (order.source !== 'telegram' && order.source !== 'whatsapp') {
      return
    }

    const customer = await getCustomerForOrder(orderId)
    if (!customer) {
      console.warn('[OrderNotifications] No customer found for order:', orderId)
      return
    }

    const message = getStatusMessage(order.order_number as string, newStatus)
    if (!message) return

    if (order.source === 'telegram') {
      const telegramId = customer.telegram_id
      if (!telegramId) {
        console.warn(
          '[OrderNotifications] No telegram_id for customer of order:',
          orderId,
        )
        return
      }
      await sendTelegramMessage(telegramId, message)
    } else if (order.source === 'whatsapp') {
      const whatsappId = customer.whatsapp_id
      if (!whatsappId) {
        console.warn(
          '[OrderNotifications] No whatsapp_id for customer of order:',
          orderId,
        )
        return
      }
      await sendWhatsAppTextMessage(whatsappId, message)
    }
  } catch (error) {
    console.error(
      '[OrderNotifications] Status notification failed (best-effort):',
      error,
    )
  }
}
