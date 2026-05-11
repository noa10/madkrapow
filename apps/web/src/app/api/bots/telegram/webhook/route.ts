import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'
import * as Sentry from '@sentry/nextjs'
import {
  getOrCreateSession,
  updateState,
  addToCart,
  clearSession,
  getCart,
  type BotSession,
  type CartItem,
  type CartModifier,
} from '@/lib/bots/conversation'
import {
  findOrCreateBotCustomer,
  updateBotCustomerContact,
  type BotContactInfo,
} from '@/lib/bots/customer'
import {
  getBotMenu,
  getBotItemWithModifiers,
  formatBotMenuText,
  formatBotItemDetails,
  type BotMenuCategory,
  type BotMenuItem,
} from '@/lib/bots/menu'
import {
  parseAddressInput,
  validateAddress,
  geocodeAddress,
  isWithinDeliveryZone,
  formatAddressForBot,
  type ParsedAddress,
} from '@/lib/bots/address'
import {
  getFreshBotSettings,
  isBotEnabled,
  getOperatingHoursForBot,
  type BotSettings,
} from '@/lib/bots/settings'
import {
  sendTelegramMessage,
  answerCallbackQuery,
  buildInlineKeyboard,
  formatPriceCents,
  type InlineKeyboardButton,
} from '@/lib/bots/telegram'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
}

interface TelegramChat {
  id: number
  type: string
}

interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number
  text?: string
}

interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: TelegramMessage
  data?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase not configured')
  }
  return createServerClient(url, key, {
    cookies: { getAll() { return [] }, setAll() {} },
  })
}

function escapeMarkdown(text: string): string {
  return text
    .replace(/_/g, '\\_')
    .replace(/\*/g, '\\*')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!')
}

async function sendErrorMessage(chatId: number): Promise<void> {
  await sendTelegramMessage(chatId, 'Sorry, something went wrong\. Please try /start again\.', {
    parse_mode: 'MarkdownV2',
  })
}

async function checkBotEnabled(settings: BotSettings | null, chatId: number): Promise<boolean> {
  if (!isBotEnabled(settings, 'telegram')) {
    await sendTelegramMessage(chatId, 'The bot is currently disabled\. Please try again later\.', {
      parse_mode: 'MarkdownV2',
    })
    return false
  }
  return true
}

async function checkOperatingHours(settings: BotSettings | null, chatId: number): Promise<boolean> {
  const hours = getOperatingHoursForBot(settings)
  if (!hours.isOpen) {
    const openText = hours.open && hours.close
      ? `We are closed\. Our hours are ${hours.open} \- ${hours.close}\.`
      : 'Sorry, we are currently closed\.'
    await sendTelegramMessage(chatId, openText, { parse_mode: 'MarkdownV2' })
    return false
  }
  return true
}

async function handleStart(chatId: number, user: TelegramUser, session: BotSession): Promise<void> {
  await clearSession(session.id)
  const name = escapeMarkdown(user.first_name)
  const welcomeText = `Welcome to *Mad Krapow*, ${name}\! 👋\n\nOrder delicious Thai food directly from this chat\. Tap the button below to browse our menu\.`

  await sendTelegramMessage(chatId, welcomeText, {
    parse_mode: 'MarkdownV2',
    reply_markup: buildInlineKeyboard([[{ text: '📋 Browse Menu', callback_data: 'menu' }]]),
  })
}

async function handleMenu(chatId: number, session: BotSession): Promise<void> {
  const supabase = getSupabase()
  const menu = await getBotMenu(supabase)

  if (menu.length === 0) {
    await sendTelegramMessage(chatId, 'Our menu is currently empty\. Please check back later\.', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  await updateState(session.id, 'browsing_menu')

  const buttons: InlineKeyboardButton[][] = menu.map((category) => [
    { text: category.name, callback_data: `cat:${category.id}` },
  ])
  buttons.push([{ text: '🛒 View Cart', callback_data: 'cart' }])

  const text = `*What would you like to order?*\n\n${escapeMarkdown(formatBotMenuText(menu))}`

  await sendTelegramMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: buildInlineKeyboard(buttons, { columns: 2 }),
  })
}

async function handleCategory(chatId: number, categoryId: string, session: BotSession): Promise<void> {
  const supabase = getSupabase()
  const menu = await getBotMenu(supabase)
  const category = menu.find((c) => c.id === categoryId)

  if (!category || category.items.length === 0) {
    await sendTelegramMessage(chatId, 'This category is empty\. Please choose another\.', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  const buttons: InlineKeyboardButton[][] = category.items.map((item) => [
    { text: `${item.name} — ${formatPriceCents(item.price_cents)}`, callback_data: `item:${item.id}` },
  ])
  buttons.push([{ text: '⬅️ Back to Categories', callback_data: 'menu' }])

  const text = `*${escapeMarkdown(category.name)}*\n\nTap an item to add it to your cart\.`

  await sendTelegramMessage(chatId, text, {
    parse_mode: 'MarkdownV2',
    reply_markup: buildInlineKeyboard(buttons),
  })
}

async function handleItem(chatId: number, itemId: string, session: BotSession): Promise<void> {
  const supabase = getSupabase()
  const item = await getBotItemWithModifiers(supabase, itemId)

  if (!item) {
    await sendTelegramMessage(chatId, 'Item not found\. Please try again\.', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  if (!item.is_available) {
    await sendTelegramMessage(chatId, `*${escapeMarkdown(item.name)}* is currently unavailable\.`, {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  if (item.modifier_groups.length > 0) {
    await updateState(session.id, 'selecting_modifiers', {
      selectedItemId: itemId,
      selectedModifierGroupIndex: 0,
    })

    const group = item.modifier_groups[0]
    const buttons: InlineKeyboardButton[][] = group.modifiers
      .filter((m) => m.is_available)
      .map((mod) => [
        {
          text: `${mod.name}${mod.price_delta_cents > 0 ? ` (+${formatPriceCents(mod.price_delta_cents)})` : ''}`,
          callback_data: `mod:${mod.id}`,
        },
      ])
    buttons.push([{ text: '❌ Cancel', callback_data: 'menu' }])

    const text = `*${escapeMarkdown(item.name)}*\n${formatPriceCents(item.price_cents)}\n\n*Select ${escapeMarkdown(group.name)}:*`

    await sendTelegramMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: buildInlineKeyboard(buttons),
    })
  } else {
    const cartItem: CartItem = {
      menuItemId: item.id,
      name: item.name,
      priceCents: item.price_cents,
      quantity: 1,
      modifiers: [],
    }

    await addToCart(session.id, cartItem)
    await updateState(session.id, 'viewing_cart')

    const text = `Added *${escapeMarkdown(item.name)}* to your cart\!`
    const buttons: InlineKeyboardButton[][] = [
      [{ text: '🛒 View Cart', callback_data: 'cart' }],
      [{ text: '➕ Add More', callback_data: 'menu' }],
    ]

    await sendTelegramMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: buildInlineKeyboard(buttons),
    })
  }
}

async function handleModifier(
  chatId: number,
  modifierId: string,
  session: BotSession
): Promise<void> {
  const supabase = getSupabase()
  const item = await getBotItemWithModifiers(supabase, session.selected_item_id || '')

  if (!item || !session.selected_item_id) {
    await sendTelegramMessage(chatId, 'Session expired\. Please start over with /start\.', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  const selectedGroupIndex = session.selected_modifier_group_index ?? 0
  const group = item.modifier_groups[selectedGroupIndex]
  const modifier = group?.modifiers.find((m) => m.id === modifierId)

  if (!modifier) {
    await sendTelegramMessage(chatId, 'Modifier not found\. Please try again\.', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  const existingCart = await getCart(session.id)
  const existingItemIndex = existingCart.findIndex(
    (ci) =>
      ci.menuItemId === session.selected_item_id &&
      ci.modifiers.some((m) => m.modifierId === modifierId)
  )

  const cartModifiers: CartModifier[] =
    existingItemIndex >= 0
      ? existingCart[existingItemIndex].modifiers
      : []

  const newModifiers = [...cartModifiers, { modifierId: modifier.id, name: modifier.name, priceDeltaCents: modifier.price_delta_cents }]

  const nextGroupIndex = selectedGroupIndex + 1
  if (nextGroupIndex < item.modifier_groups.length) {
    await updateState(session.id, 'selecting_modifiers', {
      selectedModifierGroupIndex: nextGroupIndex,
    })

    const nextGroup = item.modifier_groups[nextGroupIndex]
    const buttons: InlineKeyboardButton[][] = nextGroup.modifiers
      .filter((m) => m.is_available)
      .map((mod) => [
        {
          text: `${mod.name}${mod.price_delta_cents > 0 ? ` (+${formatPriceCents(mod.price_delta_cents)})` : ''}`,
          callback_data: `mod:${mod.id}`,
        },
      ])
    buttons.push([{ text: '❌ Cancel', callback_data: 'menu' }])

    const text = `*${escapeMarkdown(item.name)}*\n*Select ${escapeMarkdown(nextGroup.name)}:*`

    await sendTelegramMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: buildInlineKeyboard(buttons),
    })
  } else {
    const cartItem: CartItem = {
      menuItemId: item.id,
      name: item.name,
      priceCents: item.price_cents,
      quantity: 1,
      modifiers: newModifiers,
    }

    await addToCart(session.id, cartItem)
    await updateState(session.id, 'viewing_cart')

    const text = `Added *${escapeMarkdown(item.name)}* to your cart\!`
    const buttons: InlineKeyboardButton[][] = [
      [{ text: '🛒 View Cart', callback_data: 'cart' }],
      [{ text: '➕ Add More', callback_data: 'menu' }],
    ]

    await sendTelegramMessage(chatId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: buildInlineKeyboard(buttons),
    })
  }
}

async function handleCart(chatId: number, session: BotSession): Promise<void> {
  const cart = await getCart(session.id)

  if (cart.length === 0) {
    await sendTelegramMessage(chatId, 'Your cart is empty\. Tap below to browse the menu\.', {
      parse_mode: 'MarkdownV2',
      reply_markup: buildInlineKeyboard([[{ text: '📋 Browse Menu', callback_data: 'menu' }]]),
    })
    return
  }

  await updateState(session.id, 'viewing_cart')

  let totalCents = 0
  const lines: string[] = ['*Your Cart*']

  cart.forEach((item, index) => {
    const modifierTotal = item.modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0)
    const unitPrice = item.priceCents + modifierTotal
    const lineTotal = unitPrice * item.quantity
    totalCents += lineTotal

    const modifierText = item.modifiers.length > 0
      ? ` (${item.modifiers.map((m) => m.name).join(', ')})`
      : ''

    lines.push(`${index + 1}\. ${escapeMarkdown(item.name)}${escapeMarkdown(modifierText)} x${item.quantity}`)
    lines.push(`   ${formatPriceCents(lineTotal)}`)
  })

  lines.push('')
  lines.push(`*Total: ${formatPriceCents(totalCents)}*`)

  const buttons: InlineKeyboardButton[][] = [
    [{ text: '✅ Proceed to Checkout', callback_data: 'checkout' }],
    [{ text: '➕ Add More Items', callback_data: 'menu' }],
    [{ text: '🗑️ Clear Cart', callback_data: 'cancel' }],
  ]

  await sendTelegramMessage(chatId, lines.join('\n'), {
    parse_mode: 'MarkdownV2',
    reply_markup: buildInlineKeyboard(buttons),
  })
}

async function handleCheckout(chatId: number, session: BotSession): Promise<void> {
  const cart = await getCart(session.id)
  if (cart.length === 0) {
    await sendTelegramMessage(chatId, 'Your cart is empty\. Please add items first\.', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  await updateState(session.id, 'entering_address')

  await sendTelegramMessage(
    chatId,
    'Please enter your delivery address\n\n*Format:*\nHouse/Unit, Street, City, State, Postal Code\n\n_Example: 12A, Jalan Universiti, Shah Alam, Selangor, 40150_',
    { parse_mode: 'MarkdownV2' }
  )
}

async function handleAddressInput(chatId: number, text: string, session: BotSession): Promise<void> {
  const supabase = getSupabase()
  const parsed = parseAddressInput(text)
  const validation = await validateAddress(supabase, parsed)

  if (!validation.valid) {
    const errorText = validation.errors.map((e) => `• ${e}`).join('\n')
    await sendTelegramMessage(
      chatId,
      `*Address validation failed:*\n${escapeMarkdown(errorText)}\n\nPlease try again with a complete address\n\n_Example: 12A, Jalan Universiti, Shah Alam, Selangor, 40150_`,
      { parse_mode: 'MarkdownV2' }
    )
    return
  }

  try {
    const geocode = await geocodeAddress(parsed)
    if (geocode) {
      const inZone = await isWithinDeliveryZone(supabase, geocode.latitude, geocode.longitude)
      if (!inZone) {
        await sendTelegramMessage(
          chatId,
          'Sorry, your address is outside our delivery zone\. We currently only deliver within Shah Alam, Selangor\.', {
            parse_mode: 'MarkdownV2',
          }
        )
        return
      }
    }
  } catch {
    // Geocoding failed, continue with address validation only
  }

  await updateState(session.id, 'entering_contact', {
    address: parsed as unknown as Record<string, unknown>,
  })

  await sendTelegramMessage(
    chatId,
    'Great\! Now please provide your name and phone number\n\n*Format:*\nName \| Phone\n\n_Example: Ahmad \| +60123456789_',
    { parse_mode: 'MarkdownV2' }
  )
}

async function handleContactInput(chatId: number, text: string, session: BotSession): Promise<void> {
  const parts = text.split('|').map((p) => p.trim())
  const name = parts[0]
  const phone = parts[1] || ''

  if (!name || !phone) {
    await sendTelegramMessage(
      chatId,
      'Please provide both name and phone number\n\n*Format:*\nName \| Phone\n\n_Example: Ahmad \| +60123456789_',
      { parse_mode: 'MarkdownV2' }
    )
    return
  }

  const phoneRegex = /^\+?\d{10,15}$/
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    await sendTelegramMessage(
      chatId,
      'Please enter a valid phone number\n\n_Example: +60123456789_',
      { parse_mode: 'MarkdownV2' }
    )
    return
  }

  await updateState(session.id, 'confirming_order', {
    contact: { name, phone },
  })

  const cart = await getCart(session.id)
  let subtotalCents = 0
  const lines: string[] = ['*Order Summary*']

  cart.forEach((item) => {
    const modifierTotal = item.modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0)
    const unitPrice = item.priceCents + modifierTotal
    const lineTotal = unitPrice * item.quantity
    subtotalCents += lineTotal

    const modifierText = item.modifiers.length > 0
      ? ` (${item.modifiers.map((m) => m.name).join(', ')})`
      : ''

    lines.push(`${escapeMarkdown(item.name)}${escapeMarkdown(modifierText)} x${item.quantity} — ${formatPriceCents(lineTotal)}`)
  })

  const deliveryFeeCents = 0
  const totalCents = subtotalCents + deliveryFeeCents

  lines.push('')
  lines.push(`Subtotal: ${formatPriceCents(subtotalCents)}`)
  lines.push(`Delivery: ${formatPriceCents(deliveryFeeCents)}`)
  lines.push(`*Total: ${formatPriceCents(totalCents)}*`)

  const address = session.address_json as ParsedAddress | null
  if (address) {
    lines.push('')
    lines.push(`*Delivery to:*\n${escapeMarkdown(formatAddressForBot(address))}`)
  }

  const buttons: InlineKeyboardButton[][] = [
    [{ text: '💳 Confirm & Pay', callback_data: 'confirm_pay' }],
    [{ text: '❌ Cancel', callback_data: 'cancel' }],
  ]

  await sendTelegramMessage(chatId, lines.join('\n'), {
    parse_mode: 'MarkdownV2',
    reply_markup: buildInlineKeyboard(buttons),
  })
}

async function handleConfirmPay(chatId: number, user: TelegramUser, session: BotSession): Promise<void> {
  const cart = await getCart(session.id)
  if (cart.length === 0) {
    await sendTelegramMessage(chatId, 'Your cart is empty\. Please add items first\.', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  const address = session.address_json as ParsedAddress | null
  const contact = session.contact_json as { name?: string; phone?: string } | null

  if (!address || !contact?.name || !contact?.phone) {
    await sendTelegramMessage(chatId, 'Missing address or contact info\. Please start over with /start\.', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  const customer = await findOrCreateBotCustomer('telegram', String(user.id), {
    name: contact.name,
    phone: contact.phone,
  })

  await updateBotCustomerContact(customer.id, {
    name: contact.name,
    phone: contact.phone,
  })

  const checkoutPayload = {
    customerId: customer.id,
    items: cart.map((item) => ({
      id: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price_cents: item.priceCents,
      modifiers: item.modifiers.map((m) => ({
        id: m.modifierId,
        name: m.name,
        price_delta_cents: m.priceDeltaCents,
      })),
    })),
    deliveryAddress: {
      fullName: contact.name,
      phone: contact.phone,
      address: formatAddressForBot(address),
      city: address.city || 'Shah Alam',
      state: address.state || 'Selangor',
      postalCode: address.postal_code || '',
      latitude: 0,
      longitude: 0,
    },
    deliveryFee: 0,
  }

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_URL}/api/bots/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkoutPayload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Checkout failed' }))
      await sendTelegramMessage(
        chatId,
        `Payment setup failed: ${escapeMarkdown(errorData.error || 'Unknown error')}\. Please try again\.`
        , { parse_mode: 'MarkdownV2' }
      )
      return
    }

    const data = await response.json()
    if (!data.success || !data.checkoutUrl) {
      await sendTelegramMessage(chatId, 'Payment setup failed\. Please try again\.', {
        parse_mode: 'MarkdownV2',
      })
      return
    }

    await updateState(session.id, 'awaiting_payment')

    await sendTelegramMessage(
      chatId,
      `Click the link below to complete your payment:\n\n[💳 Pay ${formatPriceCents(data.totalCents || 0)}](${data.checkoutUrl})\n\n_Your order will be prepared once payment is confirmed\._`,
      { parse_mode: 'MarkdownV2' }
    )
  } catch (error) {
    console.error('[TelegramWebhook] Checkout error:', error)
    await sendTelegramMessage(chatId, 'Payment setup failed\. Please try again\.', {
      parse_mode: 'MarkdownV2',
    })
  }
}

async function handleStatus(chatId: number, user: TelegramUser): Promise<void> {
  const supabase = getSupabase()

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('telegram_id', String(user.id))
    .maybeSingle()

  if (!customer) {
    await sendTelegramMessage(chatId, 'You have no orders yet\. Start ordering with /start\!', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  const { data: orders } = await supabase
    .from('orders')
    .select('order_number, status, total_cents, created_at')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(5)

  if (!orders || orders.length === 0) {
    await sendTelegramMessage(chatId, 'You have no orders yet\. Start ordering with /start\!', {
      parse_mode: 'MarkdownV2',
    })
    return
  }

  const lines: string[] = ['*Your Recent Orders*']
  orders.forEach((order) => {
    const statusEmoji =
      order.status === 'delivered'
        ? '✅'
        : order.status === 'cancelled'
          ? '❌'
          : order.status === 'preparing' || order.status === 'ready'
            ? '👨‍🍳'
            : '📦'
    lines.push(`${statusEmoji} *${escapeMarkdown(order.order_number)}* — ${escapeMarkdown(order.status)} — ${formatPriceCents(order.total_cents)}`)
  })

  await sendTelegramMessage(chatId, lines.join('\n'), { parse_mode: 'MarkdownV2' })
}

async function handleHelp(chatId: number): Promise<void> {
  const text = `*Available Commands*\n\n/start \- Start ordering\n/menu \- Browse menu\n/cart \- View your cart\n/status \- Check recent orders\n/help \- Show this help\n/cancel \- Cancel current order\n\n*FAQ*\n• We deliver within Shah Alam, Selangor\n• Payment is via Stripe \(card/FPX\)\n• You'll receive updates as your order progresses`

  await sendTelegramMessage(chatId, text, { parse_mode: 'MarkdownV2' })
}

async function handleCancel(chatId: number, session: BotSession): Promise<void> {
  await clearSession(session.id)
  await sendTelegramMessage(
    chatId,
    'Your order has been cancelled\. Start a new order anytime with /start\!',
    { parse_mode: 'MarkdownV2' }
  )
}

async function handleCallbackQuery(
  update: TelegramUpdate,
  session: BotSession,
  settings: BotSettings | null
): Promise<void> {
  const callbackQuery = update.callback_query!
  const chatId = callbackQuery.message?.chat.id ?? callbackQuery.from.id
  const data = callbackQuery.data || ''
  const user = callbackQuery.from

  await answerCallbackQuery(callbackQuery.id)

  if (!(await checkBotEnabled(settings, chatId))) return
  if (!(await checkOperatingHours(settings, chatId))) return

  if (data === 'menu') {
    await handleMenu(chatId, session)
  } else if (data === 'cart') {
    await handleCart(chatId, session)
  } else if (data === 'checkout') {
    await handleCheckout(chatId, session)
  } else if (data === 'confirm_pay') {
    await handleConfirmPay(chatId, user, session)
  } else if (data === 'cancel') {
    await handleCancel(chatId, session)
  } else if (data.startsWith('cat:')) {
    await handleCategory(chatId, data.replace('cat:', ''), session)
  } else if (data.startsWith('item:')) {
    await handleItem(chatId, data.replace('item:', ''), session)
  } else if (data.startsWith('mod:')) {
    await handleModifier(chatId, data.replace('mod:', ''), session)
  } else {
    await sendTelegramMessage(chatId, 'Unknown action\. Please try /start\.', {
      parse_mode: 'MarkdownV2',
    })
  }
}

async function handleMessage(
  update: TelegramUpdate,
  session: BotSession,
  settings: BotSettings | null
): Promise<void> {
  const message = update.message!
  const chatId = message.chat.id
  const text = message.text || ''
  const user = message.from!

  if (!(await checkBotEnabled(settings, chatId))) return

  const command = text.trim().toLowerCase()

  if (command === '/start') {
    await handleStart(chatId, user, session)
    return
  }

  if (command === '/help') {
    await handleHelp(chatId)
    return
  }

  if (command === '/cancel') {
    await handleCancel(chatId, session)
    return
  }

  if (command === '/menu') {
    if (!(await checkOperatingHours(settings, chatId))) return
    await handleMenu(chatId, session)
    return
  }

  if (command === '/cart') {
    if (!(await checkOperatingHours(settings, chatId))) return
    await handleCart(chatId, session)
    return
  }

  if (command === '/status') {
    await handleStatus(chatId, user)
    return
  }

  if (!(await checkOperatingHours(settings, chatId))) return

  switch (session.current_state) {
    case 'entering_address':
      await handleAddressInput(chatId, text, session)
      break
    case 'entering_contact':
      await handleContactInput(chatId, text, session)
      break
    case 'browsing_menu':
    case 'selecting_modifiers':
    case 'viewing_cart':
    case 'confirming_order':
    case 'awaiting_payment':
    case 'idle':
    default:
      await sendTelegramMessage(
        chatId,
        'I did not understand that\. Use /menu to browse items or /help for commands\.'
        , { parse_mode: 'MarkdownV2' }
      )
      break
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const secretToken = req.headers.get('x-telegram-bot-api-secret-token')
    if (env.TELEGRAM_WEBHOOK_SECRET && secretToken !== env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn('[TelegramWebhook] Invalid secret token')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    let update: TelegramUpdate
    try {
      update = await req.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const user = update.message?.from ?? update.callback_query?.from
    if (!user) {
      return NextResponse.json({ success: false, error: 'No user' }, { status: 400 })
    }

    const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? user.id
    const session = await getOrCreateSession('telegram', String(user.id))
    const settings = await getFreshBotSettings()

    if (update.callback_query) {
      await handleCallbackQuery(update, session, settings)
    } else if (update.message) {
      await handleMessage(update, session, settings)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[TelegramWebhook] Unhandled error:', error)
    Sentry.captureException(error)

    try {
      const body = await req.json().catch(() => ({}))
      const chatId =
        body.message?.chat?.id ??
        body.callback_query?.message?.chat?.id ??
        body.callback_query?.from?.id
      if (chatId) {
        await sendErrorMessage(chatId)
      }
    } catch {
      // Ignore secondary errors
    }

    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
