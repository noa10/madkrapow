import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('[BotNotifications] Missing Supabase env vars')
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

async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn('[BotNotifications] TELEGRAM_BOT_TOKEN not configured')
    return
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Telegram API error ${response.status}: ${errorText}`)
  }
}

async function sendWhatsAppMessage(phoneNumber: string, text: string): Promise<void> {
  const apiToken = process.env.WHATSAPP_API_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!apiToken || !phoneNumberId) {
    console.warn('[BotNotifications] WhatsApp API credentials not configured')
    return
  }

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'text',
      text: { body: text },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`WhatsApp API error ${response.status}: ${errorText}`)
  }
}

function formatRM(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/**
 * Notify the kitchen Telegram group that a bot order has been paid.
 * Best-effort: errors are logged but never thrown.
 */
export async function notifyKitchenOfPaidOrder(orderId: string): Promise<void> {
  try {
    const supabase = getServiceClient()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_number,
        source,
        customer_name,
        customer_phone,
        total_cents,
        delivery_address_json,
        order_items (
          menu_item_name,
          quantity,
          line_total_cents
        )
      `
      )
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('[BotNotifications] Order not found for kitchen notify:', orderId, orderError)
      return
    }

    if (order.source !== 'telegram' && order.source !== 'whatsapp') {
      return
    }

    const { data: settings, error: settingsError } = await supabase
      .from('store_settings')
      .select('telegram_kitchen_group_chat_id')
      .limit(1)
      .single()

    if (settingsError) {
      console.error('[BotNotifications] Failed to fetch store settings:', settingsError)
      return
    }

    const groupChatId = settings?.telegram_kitchen_group_chat_id
    if (!groupChatId) {
      return
    }

    const items = (order.order_items as Array<{
      menu_item_name: string
      quantity: number
      line_total_cents: number
    }> | null) ?? []

    const itemList = items
      .map(i => `  • ${i.menu_item_name} x${i.quantity} (${formatRM(i.line_total_cents)})`)
      .join('\n')

    const address = order.delivery_address_json as {
      address_line1?: string
      address_line2?: string
      city?: string
      state?: string
      postal_code?: string
    } | null

    const addressText = address
      ? [
          address.address_line1,
          address.address_line2,
          address.city,
          address.state,
          address.postal_code,
        ]
          .filter(Boolean)
          .join(', ')
      : 'Self-pickup'

    const message = [
      '🔔 <b>New Bot Order Paid!</b>',
      ``,
      `<b>Order:</b> #${order.order_number}`,
      `<b>Source:</b> ${order.source}`,
      `<b>Customer:</b> ${order.customer_name} — ${order.customer_phone}`,
      ``,
      `<b>Items:</b>`,
      itemList,
      ``,
      `<b>Total:</b> ${formatRM(order.total_cents)}`,
      `<b>Address:</b> ${addressText}`,
    ].join('\n')

    await sendTelegramMessage(groupChatId, message)
  } catch (error) {
    console.error('[BotNotifications] Kitchen notification failed (best-effort):', error)
  }
}

/**
 * Notify the customer of a status change on their original platform.
 * Best-effort: errors are logged but never thrown.
 */
export async function notifyCustomerOfStatusChange(
  orderId: string,
  newStatus: string
): Promise<void> {
  try {
    const supabase = getServiceClient()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        id,
        order_number,
        source,
        customer:customer_id (
          telegram_id,
          whatsapp_id
        )
      `
      )
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('[BotNotifications] Order not found for customer notify:', orderId, orderError)
      return
    }

    if (order.source !== 'telegram' && order.source !== 'whatsapp') {
      return
    }

    const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer
    if (!customer) {
      console.warn('[BotNotifications] No customer found for order:', orderId)
      return
    }

    let message: string
    switch (newStatus) {
      case 'preparing':
        message = `✅ Payment confirmed! Order #${order.order_number} is now being prepared.`
        break
      case 'ready':
        message = `🍽️ Order #${order.order_number} is ready!`
        break
      case 'picked_up':
        message = `🛵 Order #${order.order_number} has been picked up.`
        break
      case 'delivered':
        message = `🎉 Order #${order.order_number} has been delivered. Enjoy!`
        break
      case 'cancelled':
        message = `❌ Order #${order.order_number} has been cancelled.`
        break
      default:
        message = `📦 Order #${order.order_number} status updated to: ${newStatus}`
    }

    if (order.source === 'telegram') {
      const telegramId = (customer as { telegram_id: string | null }).telegram_id
      if (!telegramId) {
        console.warn('[BotNotifications] No telegram_id for customer of order:', orderId)
        return
      }
      await sendTelegramMessage(telegramId, message)
    } else if (order.source === 'whatsapp') {
      const whatsappId = (customer as { whatsapp_id: string | null }).whatsapp_id
      if (!whatsappId) {
        console.warn('[BotNotifications] No whatsapp_id for customer of order:', orderId)
        return
      }
      await sendWhatsAppMessage(whatsappId, message)
    }
  } catch (error) {
    console.error('[BotNotifications] Customer notification failed (best-effort):', error)
  }
}
