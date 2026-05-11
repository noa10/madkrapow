import { sendTelegramMessage } from '@/lib/bots/telegram'
import { sendWhatsAppTextMessage } from '@/lib/bots/whatsapp'
import { getCustomerForOrder } from '@/lib/bots/customer'
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

function getStatusMessage(orderNumber: string, newStatus: string): string {
  switch (newStatus) {
    case 'preparing':
      return `✅ Your order #${orderNumber} is now being prepared!`
    case 'ready':
      return `🍽️ Your order #${orderNumber} is ready for pickup/delivery!`
    case 'picked_up':
      return `🚚 Your order #${orderNumber} has been picked up by the driver!`
    case 'delivered':
      return `🎉 Your order #${orderNumber} has been delivered! Enjoy your meal!`
    case 'cancelled':
      return `❌ Your order #${orderNumber} has been cancelled.`
    default:
      return `📦 Your order #${orderNumber} status updated to: ${newStatus}`
  }
}

/**
 * Send a platform-appropriate status update to the customer who placed
 * the order via Telegram or WhatsApp.
 *
 * Best-effort: errors are logged but never thrown.
 */
export async function sendOrderStatusNotification(
  orderId: string,
  newStatus: string
): Promise<void> {
  try {
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
        orderError
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

    if (order.source === 'telegram') {
      const telegramId = customer.telegram_id
      if (!telegramId) {
        console.warn(
          '[OrderNotifications] No telegram_id for customer of order:',
          orderId
        )
        return
      }
      await sendTelegramMessage(telegramId, message)
    } else if (order.source === 'whatsapp') {
      const whatsappId = customer.whatsapp_id
      if (!whatsappId) {
        console.warn(
          '[OrderNotifications] No whatsapp_id for customer of order:',
          orderId
        )
        return
      }
      await sendWhatsAppTextMessage(whatsappId, message)
    }
  } catch (error) {
    console.error(
      '[OrderNotifications] Status notification failed (best-effort):',
      error
    )
  }
}
