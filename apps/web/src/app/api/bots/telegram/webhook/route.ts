import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'
import {
  getOrCreateSession,
  updateState,
  addToCart,
  removeFromCart,
  getCart,
  clearSession,
  type BotSession,
  type CartItem,
  type CartModifier,
} from '@/lib/bots/conversation'
import {
  findOrCreateBotCustomer,
} from '@/lib/bots/customer'
import {
  getBotMenu,
  getBotItemWithModifiers,
  formatBotItemDetails,
  type BotItemWithAllModifiers,
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
  language_code?: string
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
  entities?: Array<{ type: string; offset: number; length: number }>
}

interface TelegramCallbackQuery {
  id: string
  from: TelegramUser
  message?: {
    message_id: number
    chat: TelegramChat
  }
  data?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('[TelegramWebhook] Missing Supabase env vars')
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

async function sendErrorMessage(chatId: number): Promise<void> {
  try {
    await sendTelegramMessage(
      chatId,
      'Sorry, something went wrong. Please try /start again.'
    )
  } catch (e) {
    console.error('[TelegramWebhook] Failed to send error message:', e)
  }
}

function extractCommand(text: string): string | null {
  const match = text.match(/^\/([a-zA-Z0-9_]+)(?:@\w+)?/)
  return match ? match[1].toLowerCase() : null
}

function parseCallbackData(data: string): { action: string; args: string[] } {
  const parts = data.split(':')
  return { action: parts[0], args: parts.slice(1) }
}

function getUserDisplayName(user: TelegramUser): string {
  return user.first_name + (user.last_name ? ` ${user.last_name}` : '')
}

async function checkBotAvailable(): Promise<{ ok: boolean; message?: string }> {
  const settings = await getFreshBotSettings()

  if (!isBotEnabled(settings, 'telegram')) {
    return { ok: false, message: 'Bot is currently unavailable' }
  }

  const hours = getOperatingHoursForBot(settings)
  if (!hours.isOpen) {
    const msg = hours.open
      ? `Sorry, we're closed. We open at ${hours.open}.`
      : "Sorry, we're closed. Please check our operating hours."
    return { ok: false, message: msg }
  }

  return { ok: true }
}

function formatCartText(cart: CartItem[]): string {
  if (cart.length === 0) {
    return 'Your cart is empty. Use /menu to browse items.'
  }

  const lines: string[] = ['*Your Cart*', '']
  let total = 0

  for (const item of cart) {
    const modifierTotal = item.modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0)
    const unitPrice = item.priceCents + modifierTotal
    const lineTotal = unitPrice * item.quantity
    total += lineTotal

    const modText = item.modifiers.length > 0
      ? ` (${item.modifiers.map((m) => m.name).join(', ')})`
      : ''

    lines.push(`${item.name}${modText} x${item.quantity} — ${formatPriceCents(lineTotal)}`)
  }

  lines.push('')
  lines.push(`*Total: ${formatPriceCents(total)}*`)

  return lines.join('\n')
}

function formatOrderSummary(
  cart: CartItem[],
  address: Record<string, unknown> | null,
  contact: Record<string, unknown> | null,
  deliveryFeeCents: number
): string {
  const lines: string[] = ['*Order Summary*', '']

  lines.push('*Items:*')
  let subtotal = 0
  for (const item of cart) {
    const modifierTotal = item.modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0)
    const unitPrice = item.priceCents + modifierTotal
    const lineTotal = unitPrice * item.quantity
    subtotal += lineTotal

    const modText = item.modifiers.length > 0
      ? ` (${item.modifiers.map((m) => m.name).join(', ')})`
      : ''

    lines.push(`${item.name}${modText} x${item.quantity} — ${formatPriceCents(lineTotal)}`)
  }

  lines.push('')
  lines.push(`*Subtotal:* ${formatPriceCents(subtotal)}`)
  lines.push(`*Delivery:* ${formatPriceCents(deliveryFeeCents)}`)
  lines.push(`*Total:* ${formatPriceCents(subtotal + deliveryFeeCents)}`)
  lines.push('')

  if (address) {
    lines.push(`*Address:* ${formatAddressForBot(address as ParsedAddress)}`)
  }

  if (contact) {
    const name = contact.name as string | undefined
    const phone = contact.phone as string | undefined
    if (name || phone) {
      lines.push(`*Contact:* ${name || ''} ${phone || ''}`.trim())
    }
  }

  return lines.join('\n')
}

async function handleStart(
  chatId: number,
  session: BotSession,
  user: TelegramUser
): Promise<void> {
  const name = getUserDisplayName(user)
  const welcomeText = `Welcome to Mad Krapow, ${name}! 🍽️\n\nOrder delicious food directly from this chat. Use the buttons below or type /menu to browse.`

  const keyboard = buildInlineKeyboard([
    [{ text: '📋 Browse Menu', callback_data: 'menu' }],
    [{ text: '🛒 View Cart', callback_data: 'cart' }],
    [{ text: '❓ Help', callback_data: 'help' }],
  ])

  await sendTelegramMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  })

  if (session.current_state !== 'browsing_menu') {
    await updateState(session.id, 'browsing_menu')
  }
}

async function handleMenu(chatId: number, _session: BotSession): Promise<void> {
  const supabase = getServiceClient()
  const menu = await getBotMenu(supabase)

  if (menu.length === 0) {
    await sendTelegramMessage(chatId, 'Our menu is currently empty. Please check back later!')
    return
  }

  const buttons: InlineKeyboardButton[][] = menu.map((category) => [
    { text: category.name, callback_data: `cat:${category.id}` },
  ])

  buttons.push([{ text: '🛒 View Cart', callback_data: 'cart' }])

  await sendTelegramMessage(chatId, '*Our Menu*\n\nSelect a category:', {
    parse_mode: 'Markdown',
    reply_markup: buildInlineKeyboard(buttons, { columns: 2 }),
  })
}

async function handleCart(chatId: number, session: BotSession): Promise<void> {
  const cart = await getCart(session.id)
  const text = formatCartText(cart)

  const buttons: InlineKeyboardButton[][] = []

  for (let i = 0; i < cart.length; i++) {
    buttons.push([
      { text: `➖`, callback_data: `dec:${i}` },
      { text: `${cart[i].quantity}`, callback_data: '_' },
      { text: `➕`, callback_data: `inc:${i}` },
    ])
    buttons.push([
      { text: `🗑️ Remove ${cart[i].name}`, callback_data: `rem:${i}` },
    ])
  }

  buttons.push([
    { text: '📋 Add More Items', callback_data: 'menu' },
    { text: '💳 Proceed to Checkout', callback_data: 'checkout' },
  ])

  await sendTelegramMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: buildInlineKeyboard(buttons),
  })

  if (session.current_state !== 'viewing_cart') {
    await updateState(session.id, 'viewing_cart')
  }
}

async function handleStatus(chatId: number, user: TelegramUser): Promise<void> {
  try {
    const supabase = getServiceClient()
    const customer = await findOrCreateBotCustomer('telegram', String(chatId), {
      name: getUserDisplayName(user),
    })

    const { data: orders, error } = await supabase
      .from('orders')
      .select('order_number, status, total_cents, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(3)

    if (error || !orders || orders.length === 0) {
      await sendTelegramMessage(chatId, 'You have no recent orders. Use /menu to place your first order!')
      return
    }

    const lines: string[] = ['*Recent Orders*', '']
    for (const order of orders) {
      lines.push(`#${order.order_number} — ${order.status.toUpperCase()}`)
      lines.push(`Total: ${formatPriceCents(order.total_cents)}`)
      lines.push('')
    }

    await sendTelegramMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' })
  } catch (e) {
    console.error('[TelegramWebhook] Status error:', e)
    await sendTelegramMessage(chatId, 'Unable to fetch order status. Please try again later.')
  }
}

async function handleHelp(chatId: number): Promise<void> {
  const text = [
    '*Mad Krapow Bot Commands*',
    '',
    '/start — Start ordering',
    '/menu — Browse menu categories',
    '/cart — View and manage your cart',
    '/status — Check recent order status',
    '/help — Show this help message',
    '/cancel — Clear your current session',
    '',
    'Simply follow the prompts to place your order!',
  ].join('\n')

  await sendTelegramMessage(chatId, text, { parse_mode: 'Markdown' })
}

async function handleCancel(chatId: number, session: BotSession): Promise<void> {
  await clearSession(session.id)
  await sendTelegramMessage(
    chatId,
    'Your session has been cleared. Use /start or /menu to begin again.'
  )
}

async function handleAddressInput(
  chatId: number,
  session: BotSession,
  text: string
): Promise<void> {
  const parsed = parseAddressInput(text)
  const supabase = getServiceClient()

  const validation = await validateAddress(supabase, parsed)
  if (!validation.valid) {
    const errorText = [
      '❌ Address validation failed:',
      ...validation.errors,
      '',
      'Please send a valid delivery address including:',
      '• Street address',
      '• City (Shah Alam)',
      '• State (Selangor)',
      '• Postal code',
    ].join('\n')

    await sendTelegramMessage(chatId, errorText)
    return
  }

  let lat: number | undefined
  let lng: number | undefined
  try {
    const geocodeResult = await geocodeAddress(parsed)
    if (geocodeResult) {
      lat = geocodeResult.latitude
      lng = geocodeResult.longitude
    }
  } catch (e) {
    console.error('[TelegramWebhook] Geocoding failed:', e)
  }

  if (lat !== undefined && lng !== undefined) {
    const inZone = await isWithinDeliveryZone(supabase, lat, lng)
    if (!inZone) {
      await sendTelegramMessage(
        chatId,
        'Sorry, your address is outside our delivery zone. We currently only deliver within Shah Alam. Please enter a different address or type /cancel to start over.'
      )
      return
    }
  }

  const addressWithCoords = {
    ...parsed,
    latitude: lat,
    longitude: lng,
  }

  await updateState(session.id, 'entering_contact', {
    address: addressWithCoords,
  })

  await sendTelegramMessage(
    chatId,
    '✅ Address confirmed!\n\nPlease send your name and phone number (e.g., *John Doe +60123456789*).',
    { parse_mode: 'Markdown' }
  )
}

function extractPhoneFromText(text: string): { phone?: string; remainder: string } {
  const phoneMatch = text.match(/(?:\+?60|0)[\d\s-]{8,12}/)
  if (phoneMatch) {
    const phone = phoneMatch[0].replace(/[\s-]/g, '')
    const remainder = text.replace(phoneMatch[0], '').trim().replace(/^[,-]\s*/, '')
    return { phone, remainder }
  }
  return { remainder: text }
}

async function handleContactInput(
  chatId: number,
  session: BotSession,
  text: string,
  user: TelegramUser
): Promise<void> {
  const { phone, remainder } = extractPhoneFromText(text)
  const name = remainder.trim() || getUserDisplayName(user)

  const contact = {
    name,
    phone: phone || undefined,
  }

  try {
    await findOrCreateBotCustomer('telegram', String(chatId), contact)
  } catch (e) {
    console.error('[TelegramWebhook] Failed to update customer:', e)
  }

  await updateState(session.id, 'confirming_order', {
    contact: { name, phone: phone || null },
  })

  const cart = await getCart(session.id)
  const supabase = getServiceClient()

  const { data: storeSettings } = await supabase
    .from('store_settings')
    .select('delivery_fee')
    .limit(1)
    .single()

  const deliveryFeeCents = storeSettings?.delivery_fee ?? 0
  const summary = formatOrderSummary(cart, session.address_json, { name, phone: phone || null }, deliveryFeeCents)

  const keyboard = buildInlineKeyboard([
    [{ text: '🔒 Confirm & Pay', callback_data: 'confirm' }],
    [{ text: '🛒 Back to Cart', callback_data: 'cart' }],
    [{ text: '📋 Add More Items', callback_data: 'menu' }],
  ])

  await sendTelegramMessage(chatId, summary, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  })
}

async function handleCategoryCallback(
  chatId: number,
  _session: BotSession,
  categoryId: string
): Promise<void> {
  const supabase = getServiceClient()
  const menu = await getBotMenu(supabase)
  const category = menu.find((c) => c.id === categoryId)

  if (!category || category.items.length === 0) {
    await sendTelegramMessage(chatId, 'This category is empty. Please try another.')
    return
  }

  const buttons: InlineKeyboardButton[][] = category.items.map((item) => [
    { text: `${item.name} — ${formatPriceCents(item.price_cents)}`, callback_data: `item:${item.id}` },
  ])

  buttons.push([{ text: '⬅️ Back to Categories', callback_data: 'menu' }])

  await sendTelegramMessage(
    chatId,
    `*${category.name}*\n\nTap an item to view details:`,
    {
      parse_mode: 'Markdown',
      reply_markup: buildInlineKeyboard(buttons),
    }
  )
}

async function handleItemCallback(
  chatId: number,
  session: BotSession,
  itemId: string
): Promise<void> {
  const supabase = getServiceClient()
  const item = await getBotItemWithModifiers(supabase, itemId)

  if (!item) {
    await sendTelegramMessage(chatId, 'Sorry, that item is no longer available.')
    return
  }

  if (!item.is_available) {
    await sendTelegramMessage(chatId, `*${item.name}* is currently unavailable.`, {
      parse_mode: 'Markdown',
    })
    return
  }

  const details = formatBotItemDetails(item)

  if (item.modifier_groups.length === 0) {
    const keyboard = buildInlineKeyboard([
      [{ text: '🛒 Add to Cart', callback_data: `add:${item.id}` }],
      [{ text: '📋 Back to Menu', callback_data: 'menu' }],
    ])

    await sendTelegramMessage(chatId, details, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    })
  } else {
    await updateState(session.id, 'selecting_modifiers', {
      selectedItemId: item.id,
      selectedModifierGroupIndex: 0,
    })

    await showModifierGroup(chatId, item, 0, [])
  }
}

async function showModifierGroup(
  chatId: number,
  item: BotItemWithAllModifiers,
  groupIndex: number,
  selectedModifierIds: string[]
): Promise<void> {
  const group = item.modifier_groups[groupIndex]
  if (!group) {
    await addItemToCartWithModifiers(chatId, item, selectedModifierIds)
    return
  }

  const lines: string[] = [
    `*${item.name}*`,
    '',
    `*${group.name}*${group.is_required ? ' (Required)' : ''}`,
    `Pick ${group.min_selections}${group.max_selections > group.min_selections ? `-${group.max_selections}` : ''}`,
    '',
  ]

  const buttons: InlineKeyboardButton[][] = []

  for (const mod of group.modifiers) {
    if (!mod.is_available) continue

    const priceTag = mod.price_delta_cents > 0 ? ` (+${formatPriceCents(mod.price_delta_cents)})` : ''
    const prevMods = selectedModifierIds.join(',')

    buttons.push([
      {
        text: `${mod.name}${priceTag}`,
        callback_data: `modsel:${item.id}:${groupIndex}:${prevMods}:${mod.id}`,
      },
    ])
  }

  if (!group.is_required) {
    const prevMods = selectedModifierIds.join(',')
    buttons.push([
      {
        text: '⏭️ Skip',
        callback_data: `modskip:${item.id}:${groupIndex}:${prevMods}`,
      },
    ])
  }

  buttons.push([{ text: '❌ Cancel', callback_data: 'menu' }])

  await sendTelegramMessage(chatId, lines.join('\n'), {
    parse_mode: 'Markdown',
    reply_markup: buildInlineKeyboard(buttons),
  })
}

async function handleModifierSelection(
  chatId: number,
  session: BotSession,
  itemId: string,
  groupIndex: number,
  prevSelectedModsCsv: string,
  modifierId: string
): Promise<void> {
  const supabase = getServiceClient()
  const item = await getBotItemWithModifiers(supabase, itemId)

  if (!item) {
    await sendTelegramMessage(chatId, 'Sorry, that item is no longer available.')
    return
  }

  const selectedModifierIds = prevSelectedModsCsv ? prevSelectedModsCsv.split(',') : []
  selectedModifierIds.push(modifierId)

  const nextGroupIndex = groupIndex + 1

  if (nextGroupIndex < item.modifier_groups.length) {
    await updateState(session.id, 'selecting_modifiers', {
      selectedItemId: itemId,
      selectedModifierGroupIndex: nextGroupIndex,
    })
    await showModifierGroup(chatId, item, nextGroupIndex, selectedModifierIds)
  } else {
    await addItemToCartWithModifiers(chatId, item, selectedModifierIds)
    await updateState(session.id, 'browsing_menu')
  }
}

async function handleModifierSkip(
  chatId: number,
  session: BotSession,
  itemId: string,
  groupIndex: number,
  prevSelectedModsCsv: string
): Promise<void> {
  const supabase = getServiceClient()
  const item = await getBotItemWithModifiers(supabase, itemId)

  if (!item) {
    await sendTelegramMessage(chatId, 'Sorry, that item is no longer available.')
    return
  }

  const selectedModifierIds = prevSelectedModsCsv ? prevSelectedModsCsv.split(',') : []
  const nextGroupIndex = groupIndex + 1

  if (nextGroupIndex < item.modifier_groups.length) {
    await updateState(session.id, 'selecting_modifiers', {
      selectedItemId: itemId,
      selectedModifierGroupIndex: nextGroupIndex,
    })
    await showModifierGroup(chatId, item, nextGroupIndex, selectedModifierIds)
  } else {
    await addItemToCartWithModifiers(chatId, item, selectedModifierIds)
    await updateState(session.id, 'browsing_menu')
  }
}

async function addItemToCartWithModifiers(
  chatId: number,
  item: BotItemWithAllModifiers,
  selectedModifierIds: string[]
): Promise<void> {
  const modifiers: CartModifier[] = []
  for (const modId of selectedModifierIds) {
    for (const group of item.modifier_groups) {
      const mod = group.modifiers.find((m) => m.id === modId)
      if (mod) {
        modifiers.push({
          modifierId: mod.id,
          name: mod.name,
          priceDeltaCents: mod.price_delta_cents,
        })
        break
      }
    }
  }

  const modifierTotal = modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0)
  const totalPrice = formatPriceCents(item.price_cents + modifierTotal)

  const keyboard = buildInlineKeyboard([
    [{ text: '📋 Continue Shopping', callback_data: 'menu' }],
    [{ text: '🛒 View Cart', callback_data: 'cart' }],
  ])

  await sendTelegramMessage(
    chatId,
    `✅ *${item.name}* added to cart (${totalPrice})`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  )
}

async function handleAddToCart(
  chatId: number,
  session: BotSession,
  itemId: string,
  modifierIds: string[] = []
): Promise<void> {
  const supabase = getServiceClient()
  const item = await getBotItemWithModifiers(supabase, itemId)

  if (!item || !item.is_available) {
    await sendTelegramMessage(chatId, 'Sorry, that item is no longer available.')
    return
  }

  const modifiers: CartModifier[] = []
  for (const modId of modifierIds) {
    for (const group of item.modifier_groups) {
      const mod = group.modifiers.find((m) => m.id === modId)
      if (mod) {
        modifiers.push({
          modifierId: mod.id,
          name: mod.name,
          priceDeltaCents: mod.price_delta_cents,
        })
        break
      }
    }
  }

  const cartItem: CartItem = {
    menuItemId: item.id,
    name: item.name,
    priceCents: item.price_cents,
    quantity: 1,
    modifiers,
  }

  await addToCart(session.id, cartItem)

  const modifierTotal = modifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0)
  const totalPrice = formatPriceCents(item.price_cents + modifierTotal)

  const keyboard = buildInlineKeyboard([
    [{ text: '📋 Continue Shopping', callback_data: 'menu' }],
    [{ text: '🛒 View Cart', callback_data: 'cart' }],
  ])

  await sendTelegramMessage(
    chatId,
    `✅ *${item.name}* added to cart (${totalPrice})`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    }
  )

  await updateState(session.id, 'browsing_menu')
}

async function handleCartIncrement(
  chatId: number,
  session: BotSession,
  index: number
): Promise<void> {
  const cart = await getCart(session.id)

  if (index < 0 || index >= cart.length) {
    await sendTelegramMessage(chatId, 'Item not found in cart.')
    return
  }

  const item = cart[index]
  const newItem: CartItem = { ...item, quantity: item.quantity + 1 }

  await removeFromCart(session.id, index)
  await addToCart(session.id, newItem)

  await handleCart(chatId, session)
}

async function handleCartDecrement(
  chatId: number,
  session: BotSession,
  index: number
): Promise<void> {
  const cart = await getCart(session.id)

  if (index < 0 || index >= cart.length) {
    await sendTelegramMessage(chatId, 'Item not found in cart.')
    return
  }

  const item = cart[index]

  if (item.quantity <= 1) {
    await removeFromCart(session.id, index)
  } else {
    const newItem: CartItem = { ...item, quantity: item.quantity - 1 }
    await removeFromCart(session.id, index)
    await addToCart(session.id, newItem)
  }

  await handleCart(chatId, session)
}

async function handleCartRemove(
  chatId: number,
  session: BotSession,
  index: number
): Promise<void> {
  try {
    await removeFromCart(session.id, index)
  } catch (e) {
    console.error('[TelegramWebhook] Remove from cart failed:', e)
  }

  await handleCart(chatId, session)
}

async function handleCheckoutCallback(
  chatId: number,
  session: BotSession
): Promise<void> {
  const cart = await getCart(session.id)

  if (cart.length === 0) {
    await sendTelegramMessage(chatId, 'Your cart is empty. Use /menu to add items.')
    return
  }

  await updateState(session.id, 'entering_address')

  await sendTelegramMessage(
    chatId,
    'Please send your delivery address. Include:\n• Street address\n• City (Shah Alam)\n• State (Selangor)\n• Postal code'
  )
}

async function handleConfirmCallback(
  chatId: number,
  session: BotSession
): Promise<void> {
  const cart = await getCart(session.id)

  if (cart.length === 0) {
    await sendTelegramMessage(chatId, 'Your cart is empty. Use /menu to add items.')
    return
  }

  if (!session.address_json) {
    await sendTelegramMessage(chatId, 'Please provide a delivery address first.')
    await updateState(session.id, 'entering_address')
    return
  }

  if (!session.contact_json) {
    await sendTelegramMessage(chatId, 'Please provide your contact details first.')
    await updateState(session.id, 'entering_contact')
    return
  }

  const contactName = (session.contact_json.name as string) || 'Customer'
  const contactPhone = (session.contact_json.phone as string) || ''

  const items = cart.map((item) => ({
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    modifiers: item.modifiers.map((m) => ({ modifierId: m.modifierId })),
  }))

  const deliveryAddress = {
    address_line1: String(session.address_json.address_line1 || ''),
    address_line2: session.address_json.address_line2
      ? String(session.address_json.address_line2)
      : undefined,
    city: String(session.address_json.city || ''),
    state: String(session.address_json.state || ''),
    postal_code: String(session.address_json.postal_code || ''),
    latitude: session.address_json.latitude as number | undefined,
    longitude: session.address_json.longitude as number | undefined,
  }

  try {
    const response = await fetch(`${env.NEXT_PUBLIC_URL}/api/bots/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'telegram',
        platformUserId: String(chatId),
        items,
        deliveryAddress,
        contactName,
        contactPhone,
        deliveryType: 'delivery',
      }),
    })

    const result = await response.json()

    if (!response.ok || !result.success) {
      const errorMsg = result.error || 'Unable to process checkout. Please try again.'
      await sendTelegramMessage(chatId, `❌ ${errorMsg}`)
      return
    }

    const { checkoutUrl, orderNumber } = result

    await updateState(session.id, 'awaiting_payment')

    const keyboard = buildInlineKeyboard([
      [{ text: `🔒 Pay Now`, url: checkoutUrl }],
    ])

    await sendTelegramMessage(
      chatId,
      `✅ Order *#${orderNumber}* created!\n\nClick the button below to complete payment:`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    )
  } catch (e) {
    console.error('[TelegramWebhook] Checkout failed:', e)
    await sendTelegramMessage(
      chatId,
      'Sorry, we were unable to process your checkout. Please try again later.'
    )
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const secretToken = env.TELEGRAM_WEBHOOK_SECRET
    if (secretToken) {
      const headerToken = req.headers.get('x-telegram-bot-api-secret-token')
      if (headerToken !== secretToken) {
        console.error('[TelegramWebhook] Invalid secret token')
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
      }
    }

    let update: TelegramUpdate
    try {
      update = await req.json()
    } catch (e) {
      console.error('[TelegramWebhook] Invalid JSON:', e)
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const message = update.message
    const callbackQuery = update.callback_query

    if (!message && !callbackQuery) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const chatId = message?.chat.id ?? callbackQuery?.message?.chat.id
    const user = message?.from ?? callbackQuery?.from

    if (!chatId || !user) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const availability = await checkBotAvailable()
    if (!availability.ok) {
      await sendTelegramMessage(chatId, availability.message!)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const session = await getOrCreateSession('telegram', String(chatId))

    if (callbackQuery) {
      const data = callbackQuery.data || ''
      const { action, args } = parseCallbackData(data)

      try {
        await answerCallbackQuery(callbackQuery.id)
      } catch (e) {
        console.error('[TelegramWebhook] answerCallbackQuery failed:', e)
      }

      switch (action) {
        case 'menu':
          await handleMenu(chatId, session)
          break
        case 'cat':
          await handleCategoryCallback(chatId, session, args[0])
          break
        case 'item':
          await handleItemCallback(chatId, session, args[0])
          break
        case 'modsel':
          await handleModifierSelection(
            chatId,
            session,
            args[0],
            parseInt(args[1], 10),
            args[2] || '',
            args[3]
          )
          break
        case 'modskip':
          await handleModifierSkip(
            chatId,
            session,
            args[0],
            parseInt(args[1], 10),
            args[2] || ''
          )
          break
        case 'add':
          await handleAddToCart(chatId, session, args[0], args[1] ? args[1].split(',') : [])
          break
        case 'cart':
          await handleCart(chatId, session)
          break
        case 'inc':
          await handleCartIncrement(chatId, session, parseInt(args[0], 10))
          break
        case 'dec':
          await handleCartDecrement(chatId, session, parseInt(args[0], 10))
          break
        case 'rem':
          await handleCartRemove(chatId, session, parseInt(args[0], 10))
          break
        case 'checkout':
          await handleCheckoutCallback(chatId, session)
          break
        case 'confirm':
          await handleConfirmCallback(chatId, session)
          break
        case 'help':
          await handleHelp(chatId)
          break
        case 'cancel':
          await handleCancel(chatId, session)
          break
        case 'status':
          await handleStatus(chatId, user)
          break
        default:
          break
      }

      return NextResponse.json({ success: true }, { status: 200 })
    }

    if (message && message.text) {
      const text = message.text.trim()
      const command = extractCommand(text)

      if (command) {
        switch (command) {
          case 'start':
            await handleStart(chatId, session, user)
            break
          case 'menu':
            await handleMenu(chatId, session)
            break
          case 'cart':
            await handleCart(chatId, session)
            break
          case 'status':
            await handleStatus(chatId, user)
            break
          case 'help':
            await handleHelp(chatId)
            break
          case 'cancel':
            await handleCancel(chatId, session)
            break
          default:
            await sendTelegramMessage(
              chatId,
              "I didn't understand that command. Type /help for available commands."
            )
            break
        }

        return NextResponse.json({ success: true }, { status: 200 })
      }

      switch (session.current_state) {
        case 'entering_address':
          await handleAddressInput(chatId, session, text)
          break
        case 'entering_contact':
          await handleContactInput(chatId, session, text, user)
          break
        case 'browsing_menu':
        case 'selecting_modifiers':
        case 'viewing_cart':
        case 'confirming_order':
        case 'awaiting_payment':
        case 'complete':
        case 'idle':
        default:
          await sendTelegramMessage(
            chatId,
            "I didn't understand that. Use /menu to browse items or /help for commands."
          )
          break
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[TelegramWebhook] Unhandled error:', error)

    try {
      const body = await req.json().catch(() => null)
      const chatId =
        body?.message?.chat?.id ?? body?.callback_query?.message?.chat?.id
      if (chatId) {
        await sendErrorMessage(chatId)
      }
    } catch {
    }

    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 200 })
  }
}
