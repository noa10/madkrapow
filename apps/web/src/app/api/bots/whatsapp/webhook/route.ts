import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'
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
  type BotSettings,
} from '@/lib/bots/settings'
import {
  sendWhatsAppTextMessage,
  sendWhatsAppListMessage,
  sendWhatsAppReplyButtons,
  type ListSection,
  type ReplyButton,
} from '@/lib/bots/whatsapp'


interface WhatsAppText {
  body: string
}

interface WhatsAppListReply {
  id: string
  title: string
}

interface WhatsAppButtonReply {
  id: string
  title: string
}

interface WhatsAppInteractive {
  type: 'list_reply' | 'button_reply'
  list_reply?: WhatsAppListReply
  button_reply?: WhatsAppButtonReply
}

interface WhatsAppMessage {
  from: string
  id: string
  type: 'text' | 'interactive'
  text?: WhatsAppText
  interactive?: WhatsAppInteractive
}

interface WhatsAppContact {
  profile: { name: string }
  wa_id: string
}

interface WhatsAppValue {
  messaging_product: string
  metadata: { display_phone_number: string; phone_number_id: string }
  contacts?: WhatsAppContact[]
  messages?: WhatsAppMessage[]
}

interface WhatsAppChange {
  value: WhatsAppValue
  field: string
}

interface WhatsAppEntry {
  id: string
  changes: WhatsAppChange[]
}

interface WhatsAppPayload {
  object: string
  entry: WhatsAppEntry[]
}

interface CheckoutResponse {
  success: boolean
  checkoutUrl?: string
  orderId?: string
  orderNumber?: string
  error?: string
}


function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[WhatsAppWebhook] Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    )
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

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

function safeParseCart(cartJson: unknown): CartItem[] {
  if (!cartJson) return []
  if (Array.isArray(cartJson)) return cartJson as CartItem[]
  if (typeof cartJson === 'string') {
    try {
      return JSON.parse(cartJson) as CartItem[]
    } catch {
      return []
    }
  }
  return []
}

function extractMessage(payload: WhatsAppPayload): {
  phone: string | null
  name: string | null
  message: WhatsAppMessage | null
} {
  const entry = payload.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  const message = value?.messages?.[0]
  const contact = value?.contacts?.[0]

  if (!message) {
    return { phone: null, name: null, message: null }
  }

  return {
    phone: message.from,
    name: contact?.profile?.name ?? null,
    message,
  }
}


async function showWelcome(phone: string): Promise<void> {
  const supabase = getSupabaseClient()
  const menu = await getBotMenu(supabase)

  if (menu.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      'Our menu is currently empty. Please check back later!'
    )
    return
  }

  const sections: ListSection[] = [
    {
      title: 'Categories',
      rows: menu.map((category) => ({
        id: `cat:${category.id}`,
        title: category.name.substring(0, 24),
        description: `${category.items.length} items`.substring(0, 72),
      })),
    },
  ]

  await sendWhatsAppListMessage(
    phone,
    'Welcome to Mad Krapow!',
    'Tap a category to browse items.',
    sections,
    'View Categories'
  )
}

async function showCategoryItems(
  phone: string,
  categoryId: string,
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<void> {
  const menu = await getBotMenu(supabase)
  const category = menu.find((c) => c.id === categoryId)

  if (!category || category.items.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      'Sorry, that category is empty or no longer available.'
    )
    await showWelcome(phone)
    return
  }

  const sections: ListSection[] = [
    {
      title: category.name,
      rows: category.items.map((item) => ({
        id: `item:${item.id}`,
        title: item.name.substring(0, 24),
        description: `${formatPrice(item.price_cents)}${
          item.has_modifiers ? ' (+options)' : ''
        }`.substring(0, 72),
      })),
    },
  ]

  await sendWhatsAppListMessage(
    phone,
    category.name,
    'Tap an item to add to your cart.',
    sections,
    'View Items'
  )
}


async function handleItemSelection(
  phone: string,
  itemId: string,
  session: BotSession,
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<void> {
  const item = await getBotItemWithModifiers(supabase, itemId)

  if (!item) {
    await sendWhatsAppTextMessage(
      phone,
      'Sorry, that item is no longer available.'
    )
    return
  }

  if (!item.is_available) {
    await sendWhatsAppTextMessage(
      phone,
      `Sorry, *${item.name}* is currently unavailable.`
    )
    return
  }

  if (item.modifier_groups.length === 0) {

        const cartItem: CartItem = {
      menuItemId: item.id,
      name: item.name,
      priceCents: item.price_cents,
      quantity: 1,
      modifiers: [],
    }
    await addToCart(session.id, cartItem)
    await sendWhatsAppTextMessage(
      phone,
      `Added *${item.name}* to your cart.`
    )

    const freshSession = await getOrCreateSession('whatsapp', phone)
    await updateState(freshSession.id, 'viewing_cart')
    await showCart(phone, freshSession)
    return
  }


    
  const updatedSession = await updateState(session.id, 'selecting_modifiers', {
    selectedItemId: item.id,
    selectedModifierGroupIndex: 0,
  })

  await showModifierGroup(phone, updatedSession, item)
}


async function showModifierGroup(
  phone: string,
  session: BotSession,
  item: BotItemWithAllModifiers
): Promise<void> {
  const groupIndex = session.selected_modifier_group_index ?? 0
  const group = item.modifier_groups[groupIndex]

  if (!group) {

        const freshSession = await getOrCreateSession('whatsapp', phone)
    await updateState(freshSession.id, 'viewing_cart', {
      selectedItemId: null,
      selectedModifierGroupIndex: null,
    })
    await showCart(phone, freshSession)
    return
  }

  const body = `*${item.name}*\n${formatPrice(item.price_cents)}\n\n*${group.name}*${
    group.is_required ? ' (Required)' : ''
  }\nPick ${group.min_selections}${
    group.max_selections > group.min_selections
      ? `-${group.max_selections}`
      : ''
  }`

  const availableModifiers = group.modifiers.filter((m) => m.is_available)

  if (availableModifiers.length === 0) {

        const supabase = getSupabaseClient()
    await supabase
      .from('bot_sessions')
      .update({
        selected_modifier_group_index: groupIndex + 1,
        last_interaction_at: new Date().toISOString(),
      })
      .eq('id', session.id)

    const freshSession = await getOrCreateSession('whatsapp', phone)
    const nextIndex = freshSession.selected_modifier_group_index ?? 0
    if (nextIndex >= item.modifier_groups.length) {
      await updateState(freshSession.id, 'viewing_cart', {
        selectedItemId: null,
        selectedModifierGroupIndex: null,
      })
      await showCart(phone, freshSession)
    } else {
      await showModifierGroup(phone, freshSession, item)
    }
    return
  }

  if (availableModifiers.length <= 3) {
    const buttons: ReplyButton[] = availableModifiers.map((mod) => ({
      id: `mod:${mod.id}`,
      title: mod.name.substring(0, 20),
    }))
    await sendWhatsAppReplyButtons(phone, body, buttons)
  } else {
    const sections: ListSection[] = [
      {
        title: group.name,
        rows: availableModifiers.map((mod) => ({
          id: `mod:${mod.id}`,
          title: mod.name.substring(0, 24),
          description:
            mod.price_delta_cents > 0
              ? `+${formatPrice(mod.price_delta_cents)}`.substring(0, 72)
              : 'Included',
        })),
      },
    ]
    await sendWhatsAppListMessage(
      phone,
      item.name,
      body,
      sections,
      'Select Option'
    )
  }
}

async function handleModifierSelection(
  phone: string,
  modifierId: string,
  session: BotSession,
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<void> {
  const item = await getBotItemWithModifiers(
    supabase,
    session.selected_item_id!
  )

  if (!item) {
    await sendWhatsAppTextMessage(
      phone,
      'Sorry, that item is no longer available.'
    )
    await updateState(session.id, 'browsing_menu')
    await showWelcome(phone)
    return
  }

  const groupIndex = session.selected_modifier_group_index ?? 0
  const group = item.modifier_groups[groupIndex]

  if (!group) {

        await updateState(session.id, 'viewing_cart', {
      selectedItemId: null,
      selectedModifierGroupIndex: null,
    })
    const freshSession = await getOrCreateSession('whatsapp', phone)
    await showCart(phone, freshSession)
    return
  }

  const modifier = group.modifiers.find((m) => m.id === modifierId)
  if (!modifier || !modifier.is_available) {
    await sendWhatsAppTextMessage(
      phone,
      'Invalid option. Please try again.'
    )
    await showModifierGroup(phone, session, item)
    return
  }

  const cartModifier: CartModifier = {
    modifierId: modifier.id,
    name: modifier.name,
    priceDeltaCents: modifier.price_delta_cents,
  }


    const { data: sessionData } = await supabase
    .from('bot_sessions')
    .select('cart_json')
    .eq('id', session.id)
    .single()

  const cart = safeParseCart(sessionData?.cart_json)
  const lastItem = cart[cart.length - 1]

  if (lastItem && lastItem.menuItemId === item.id && groupIndex > 0) {

        const updatedCart = cart.map((ci, idx) =>
      idx === cart.length - 1
        ? { ...ci, modifiers: [...ci.modifiers, cartModifier] }
        : ci
    )
    await supabase
      .from('bot_sessions')
      .update({
        cart_json: updatedCart,
        selected_modifier_group_index: groupIndex + 1,
        last_interaction_at: new Date().toISOString(),
      })
      .eq('id', session.id)
  } else {

        const newItem: CartItem = {
      menuItemId: item.id,
      name: item.name,
      priceCents: item.price_cents,
      quantity: 1,
      modifiers: [cartModifier],
    }
    const updatedCart = [...cart, newItem]
    await supabase
      .from('bot_sessions')
      .update({
        cart_json: updatedCart,
        selected_modifier_group_index: groupIndex + 1,
        last_interaction_at: new Date().toISOString(),
      })
      .eq('id', session.id)
  }

  const nextGroupIndex = groupIndex + 1
  if (nextGroupIndex >= item.modifier_groups.length) {

        const freshSession = await getOrCreateSession('whatsapp', phone)
    await updateState(freshSession.id, 'viewing_cart', {
      selectedItemId: null,
      selectedModifierGroupIndex: null,
    })
    await sendWhatsAppTextMessage(
      phone,
      `Added *${item.name}* to your cart.`
    )
    await showCart(phone, freshSession)
  } else {

        const freshSession = await getOrCreateSession('whatsapp', phone)
    await showModifierGroup(phone, freshSession, item)
  }
}


async function showCart(phone: string, session: BotSession): Promise<void> {
  const cart = await getCart(session.id)

  if (cart.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      'Your cart is empty. Type *Menu* to browse our menu.'
    )
    return
  }

  let totalCents = 0
  const lines: string[] = ['*Your Cart*']

  for (let i = 0; i < cart.length; i++) {
    const item = cart[i]
    const modifierTotal = item.modifiers.reduce(
      (sum, m) => sum + m.priceDeltaCents,
      0
    )
    const unitPrice = item.priceCents + modifierTotal
    const lineTotal = unitPrice * item.quantity
    totalCents += lineTotal

    const modifierText =
      item.modifiers.length > 0
        ? ` (${item.modifiers.map((m) => m.name).join(', ')})`
        : ''

    lines.push(`${i + 1}. ${item.name}${modifierText}`)
    lines.push(
      `   ${item.quantity} x ${formatPrice(unitPrice)} = ${formatPrice(
        lineTotal
      )}`
    )
  }

  lines.push('')
  lines.push(`*Total: ${formatPrice(totalCents)}*`)

  const buttons: ReplyButton[] = [
    { id: 'cart:add_more', title: 'Add More' },
    { id: 'cart:checkout', title: 'Checkout' },
  ]

  await sendWhatsAppReplyButtons(phone, lines.join('\n'), buttons)
}


async function handleAddressInput(
  phone: string,
  text: string,
  session: BotSession
): Promise<void> {
  const parsed = parseAddressInput(text)
  const supabase = getSupabaseClient()

  const validation = await validateAddress(supabase, parsed)
  if (!validation.valid) {
    await sendWhatsAppTextMessage(
      phone,
      `Invalid address: ${validation.errors.join(', ')}. Please try again with a complete address including street, city, state, and postal code.`
    )
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
  } catch (err) {
    console.error('[WhatsAppWebhook] Geocoding failed:', err)
  }

  if (lat !== undefined && lng !== undefined) {
    const inZone = await isWithinDeliveryZone(supabase, lat, lng)
    if (!inZone) {
      await sendWhatsAppTextMessage(
        phone,
        'Sorry, your address is outside our delivery zone. We currently only deliver to Shah Alam, Selangor.'
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

  await sendWhatsAppTextMessage(
    phone,
    'Great! Now please provide your name and phone number.\n\nExample:\nJohn Doe\n+60123456789'
  )
}


async function handleContactInput(
  phone: string,
  text: string,
  session: BotSession
): Promise<void> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let name: string | undefined
  let contactPhone: string | undefined

  if (lines.length >= 2) {
    name = lines[0]
    contactPhone = lines[1]
  } else {
    name = lines[0]
    contactPhone = phone
  }

  if (!name) {
    await sendWhatsAppTextMessage(
      phone,
      'Please provide your name and phone number.\n\nExample:\nJohn Doe\n+60123456789'
    )
    return
  }

  await updateState(session.id, 'confirming_order', {
    contact: { name, phone: contactPhone },
  })


    try {
    const customer = await findOrCreateBotCustomer('whatsapp', phone, {
      name,
      phone: contactPhone,
    })
    await updateBotCustomerContact(customer.id, { name, phone: contactPhone })
  } catch (err) {
    console.error('[WhatsAppWebhook] Failed to update customer contact:', err)
  }

  await showConfirmation(phone, session)
}


async function showConfirmation(
  phone: string,
  session: BotSession
): Promise<void> {
  const cart = await getCart(session.id)

  if (cart.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      'Your cart is empty. Type *Menu* to browse our menu.'
    )
    await updateState(session.id, 'browsing_menu')
    return
  }

  let totalCents = 0
  const lines: string[] = ['*Order Summary*']

  for (const item of cart) {
    const modifierTotal = item.modifiers.reduce(
      (sum, m) => sum + m.priceDeltaCents,
      0
    )
    const unitPrice = item.priceCents + modifierTotal
    const lineTotal = unitPrice * item.quantity
    totalCents += lineTotal

    const modifierText =
      item.modifiers.length > 0
        ? ` (${item.modifiers.map((m) => m.name).join(', ')})`
        : ''

    lines.push(`• ${item.name}${modifierText}`)
    lines.push(`  ${item.quantity} x ${formatPrice(unitPrice)}`)
  }

  lines.push('')
  lines.push(`*Total: ${formatPrice(totalCents)}*`)

  if (session.address_json) {
    lines.push('')
    lines.push('*Delivery Address:*')
    lines.push(formatAddressForBot(session.address_json as ParsedAddress))
  }

  if (session.contact_json) {
    const contact = session.contact_json as { name?: string; phone?: string }
    lines.push('')
    lines.push('*Contact:*')
    if (contact.name) lines.push(contact.name)
    if (contact.phone) lines.push(contact.phone)
  }

  const buttons: ReplyButton[] = [
    { id: 'confirm:pay', title: 'Confirm & Pay' },
  ]

  await sendWhatsAppReplyButtons(phone, lines.join('\n'), buttons)
}

async function handleConfirmation(
  phone: string,
  session: BotSession,
  _settings: BotSettings | null
): Promise<void> {
  const cart = await getCart(session.id)

  if (cart.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      'Your cart is empty. Type *Menu* to start over.'
    )
    await updateState(session.id, 'browsing_menu')
    return
  }

  if (!session.address_json) {
    await sendWhatsAppTextMessage(
      phone,
      'Please provide your delivery address first.'
    )
    await updateState(session.id, 'entering_address')
    return
  }

  if (!session.contact_json) {
    await sendWhatsAppTextMessage(
      phone,
      'Please provide your contact details first.'
    )
    await updateState(session.id, 'entering_contact')
    return
  }

  const address = session.address_json as ParsedAddress & {
    latitude?: number
    longitude?: number
  }
  const contact = session.contact_json as { name?: string; phone?: string }

  const checkoutPayload = {
    platform: 'whatsapp',
    platformUserId: phone,
    items: cart.map((item) => ({
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      modifiers: item.modifiers.map((m) => ({ modifierId: m.modifierId })),
    })),
    deliveryAddress: {
      address_line1: address.address_line1,
      address_line2: address.address_line2,
      city: address.city ?? 'Shah Alam',
      state: address.state ?? 'Selangor',
      postal_code: address.postal_code ?? '',
      latitude: address.latitude,
      longitude: address.longitude,
    },
    contactName: contact.name ?? 'Guest',
    contactPhone: contact.phone ?? phone,
    deliveryType: 'delivery' as const,
  }

  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_URL}/api/bots/checkout`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkoutPayload),
      }
    )

    const result = (await response.json()) as CheckoutResponse

    if (!response.ok || !result.success) {
      const errorMsg =
        result.error || 'Unable to process checkout. Please try again.'
      await sendWhatsAppTextMessage(phone, `Checkout failed: ${errorMsg}`)
      return
    }

    await updateState(session.id, 'awaiting_payment')
    await sendWhatsAppTextMessage(
      phone,
      `Please complete your payment here:\n\n${result.checkoutUrl}\n\nOrder #${result.orderNumber}`
    )
  } catch (err) {
    console.error('[WhatsAppWebhook] Checkout error:', err)
    await sendWhatsAppTextMessage(
      phone,
      'Sorry, something went wrong with checkout. Please try again later.'
    )
  }
}


async function showOrderStatus(phone: string, _session: BotSession): Promise<void> {
  const supabase = getSupabaseClient()

  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('whatsapp_id', phone)
    .maybeSingle()

  if (!customer) {
    await sendWhatsAppTextMessage(
      phone,
      'You have no orders yet. Type *Menu* to place your first order!'
    )
    return
  }

  const { data: orders } = await supabase
    .from('orders')
    .select('order_number, status, total_cents, created_at')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(3)

  if (!orders || orders.length === 0) {
    await sendWhatsAppTextMessage(
      phone,
      'You have no recent orders. Type *Menu* to place your first order!'
    )
    return
  }

  const lines: string[] = ['*Your Recent Orders*']
  for (const order of orders) {
    const date = new Date(order.created_at).toLocaleDateString('en-MY')
    lines.push(`• #${order.order_number}`)
    lines.push(`  Status: ${order.status}`)
    lines.push(`  Total: ${formatPrice(order.total_cents)}`)
    lines.push(`  Date: ${date}`)
    lines.push('')
  }

  await sendWhatsAppTextMessage(phone, lines.join('\n').trim())
}


async function handleInteractiveReply(
  phone: string,
  replyId: string,
  session: BotSession,
  _settings: BotSettings | null
): Promise<void> {
  const supabase = getSupabaseClient()

  if (replyId.startsWith('cat:')) {
    const categoryId = replyId.slice(4)
    await showCategoryItems(phone, categoryId, supabase)
    return
  }

  if (replyId.startsWith('item:')) {
    const itemId = replyId.slice(5)
    await handleItemSelection(phone, itemId, session, supabase)
    return
  }

  if (replyId.startsWith('mod:')) {
    const modifierId = replyId.slice(4)
    await handleModifierSelection(phone, modifierId, session, supabase)
    return
  }

  if (replyId === 'cart:add_more') {
    const freshSession = await getOrCreateSession('whatsapp', phone)
    await updateState(freshSession.id, 'browsing_menu')
    await showWelcome(phone)
    return
  }

  if (replyId === 'cart:checkout') {
    const freshSession = await getOrCreateSession('whatsapp', phone)
    await updateState(freshSession.id, 'entering_address')
    await sendWhatsAppTextMessage(
      phone,
      'Please enter your delivery address. Include street, city, state, and postal code.'
    )
    return
  }

  if (replyId === 'confirm:pay') {
    await handleConfirmation(phone, session, _settings)
    return
  }

  await sendWhatsAppTextMessage(
    phone,
    'Sorry, I did not understand that selection.'
  )
}

async function handleTextInput(
  phone: string,
  text: string,
  session: BotSession,
  settings: BotSettings | null
): Promise<void> {
  switch (session.current_state) {
    case 'entering_address':
      await handleAddressInput(phone, text, session)
      return
    case 'entering_contact':
      await handleContactInput(phone, text, session)
      return
    case 'confirming_order':
      if (text.toLowerCase() === 'yes' || text.toLowerCase() === 'confirm') {
        await handleConfirmation(phone, session, settings)
      } else {
        await sendWhatsAppTextMessage(
          phone,
          'Please tap *Confirm & Pay* to proceed, or type *Cancel* to start over.'
        )
      }
      return
    case 'awaiting_payment':
      await sendWhatsAppTextMessage(
        phone,
        'Please complete your payment using the link above. Type *Menu* to start a new order.'
      )
      return
    case 'browsing_menu':
    case 'selecting_modifiers':
    case 'viewing_cart':
    default:
      await sendWhatsAppTextMessage(
        phone,
        'Type *Menu* to see our menu, *Cart* to view your cart, *Status* to check your order, or *Cancel* to start over.'
      )
      return
  }
}

async function handleMessage(
  phone: string,
  message: WhatsAppMessage,
  session: BotSession,
  settings: BotSettings | null
): Promise<void> {
  const text =
    message.type === 'text' ? message.text?.body?.trim() : undefined
  const interactive =
    message.type === 'interactive' ? message.interactive : undefined


    if (text) {
    const lowerText = text.toLowerCase()
    if (['hi', 'hello', 'menu'].includes(lowerText)) {
      await clearSession(session.id)
      await showWelcome(phone)
      return
    }
    if (lowerText === 'cart') {
      const freshSession = await getOrCreateSession('whatsapp', phone)
      await updateState(freshSession.id, 'viewing_cart')
      await showCart(phone, freshSession)
      return
    }
    if (lowerText === 'status') {
      await showOrderStatus(phone, session)
      return
    }
    if (lowerText === 'cancel') {
      await clearSession(session.id)
      await sendWhatsAppTextMessage(
        phone,
        'Your session has been cleared. Type *Menu* to start over.'
      )
      return
    }
  }


    if (interactive) {
    const replyId =
      interactive.type === 'list_reply'
        ? interactive.list_reply?.id
        : interactive.button_reply?.id

    if (!replyId) {
      await sendWhatsAppTextMessage(
        phone,
        'Sorry, I did not understand that.'
      )
      return
    }

    await handleInteractiveReply(phone, replyId, session, settings)
    return
  }

  if (text) {
    await handleTextInput(phone, text, session, settings)
    return
  }

  await sendWhatsAppTextMessage(
    phone,
    'Sorry, I can only process text and button messages right now.'
  )
}


export async function GET(req: NextRequest): Promise<NextResponse> {
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Verification failed', { status: 403 })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const payload: WhatsAppPayload = await req.json()
    const { phone, name, message } = extractMessage(payload)

    if (!phone || !message) {
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }


        const settings = await getFreshBotSettings()


        if (!isBotEnabled(settings, 'whatsapp')) {
      await sendWhatsAppTextMessage(phone, 'Bot is currently unavailable.')
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }


        const hours = getOperatingHoursForBot(settings)
    if (!hours.isOpen) {
      const hoursMsg =
        hours.open && hours.close
          ? `We are currently closed. Our hours today are ${hours.open} - ${hours.close}.`
          : 'We are currently closed. Please check our operating hours.'
      await sendWhatsAppTextMessage(phone, hoursMsg)
      return NextResponse.json({ status: 'ok' }, { status: 200 })
    }


        const contactInfo: BotContactInfo = {
      name: name ?? undefined,
      phone,
    }
    await findOrCreateBotCustomer('whatsapp', phone, contactInfo)


        const session = await getOrCreateSession('whatsapp', phone)


        await handleMessage(phone, message, session, settings)

    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (error) {
    console.error('[WhatsAppWebhook] Error:', error)

        return NextResponse.json({ status: 'error' }, { status: 200 })
  }
}
