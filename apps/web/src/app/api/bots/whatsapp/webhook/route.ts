import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { env } from '@/lib/validators/env'
import {
  getOrCreateSession,
  updateState,
  addToCart,
  getCart,
  clearSession,
  type BotSession,
  type CartModifier,
} from '@/lib/bots/conversation'
import { findOrCreateBotCustomer, updateBotCustomerContact } from '@/lib/bots/customer'
import {
  getBotMenu,
  getBotItemWithModifiers,
  formatBotItemDetails,
  type BotMenuCategory,
} from '@/lib/bots/menu'
import {
  parseAddressInput,
  validateAddress,
  geocodeAddress,
  isWithinDeliveryZone,
  formatAddressForBot,
} from '@/lib/bots/address'
import {
  getFreshBotSettings,
  isBotEnabled,
  getOperatingHoursForBot,
} from '@/lib/bots/settings'
import {
  sendWhatsAppTextMessage,
  sendWhatsAppListMessage,
  sendWhatsAppReplyButtons,
  type ListSection,
  type ReplyButton,
} from '@/lib/bots/whatsapp'

const VERIFY_TOKEN = env.WHATSAPP_VERIFY_TOKEN

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')
  return createServerClient(url, key, {
    cookies: { getAll() { return [] }, setAll() {} },
  })
}

interface WhatsAppMessage {
  from: string
  type: string
  text?: { body: string }
  interactive?: {
    type: string
    list_reply?: { id: string; title: string }
    button_reply?: { id: string; title: string }
  }
}

function extractMessage(body: unknown): WhatsAppMessage | null {
  if (typeof body !== 'object' || body === null) return null
  const obj = body as Record<string, unknown>
  if (obj.object !== 'whatsapp_business_account') return null

  const entries = obj.entry as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(entries) || entries.length === 0) return null

  const changes = entries[0].changes as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(changes) || changes.length === 0) return null

  const value = changes[0].value as Record<string, unknown> | undefined
  if (!value) return null

  const messages = value.messages as Array<Record<string, unknown>> | undefined
  if (!Array.isArray(messages) || messages.length === 0) return null

  const msg = messages[0]
  return {
    from: String(msg.from || ''),
    type: String(msg.type || ''),
    text: msg.text as { body: string } | undefined,
    interactive: msg.interactive as
      | {
          type: string
          list_reply?: { id: string; title: string }
          button_reply?: { id: string; title: string }
        }
      | undefined,
  }
}

function getMessageText(msg: WhatsAppMessage): string {
  if (msg.type === 'text' && msg.text?.body) {
    return msg.text.body.trim()
  }
  if (msg.type === 'interactive' && msg.interactive) {
    if (msg.interactive.list_reply) {
      return msg.interactive.list_reply.id
    }
    if (msg.interactive.button_reply) {
      return msg.interactive.button_reply.id
    }
  }
  return ''
}

async function sendWelcome(phone: string, menu: BotMenuCategory[]) {
  const sections: ListSection[] = menu.map((cat) => ({
    title: cat.name,
    rows: cat.items.map((item) => ({
      id: `item:${item.id}`,
      title: item.name.substring(0, 24),
      description: `${formatPrice(item.price_cents)}${item.has_modifiers ? ' (+opts)' : ''}`,
    })),
  }))

  await sendWhatsAppListMessage(
    phone,
    'Mad Krapow Menu',
    'Welcome! Browse our menu and tap an item to order.',
    sections.filter((s) => s.rows.length > 0),
    'Browse Menu'
  )
}

async function sendItemDetails(phone: string, item: Awaited<ReturnType<typeof getBotItemWithModifiers>>) {
  if (!item) {
    await sendWhatsAppTextMessage(phone, 'Sorry, that item is no longer available.')
    return
  }

  const details = formatBotItemDetails(item)
  const buttons: ReplyButton[] = [
    { id: `add:${item.id}`, title: 'Add to Cart' },
    { id: 'menu', title: 'Back to Menu' },
  ]

  await sendWhatsAppReplyButtons(phone, details, buttons)
}

async function sendModifierSelection(
  phone: string,
  session: BotSession,
  item: Awaited<ReturnType<typeof getBotItemWithModifiers>>
) {
  if (!item || session.selected_modifier_group_index == null) return

  const group = item.modifier_groups[session.selected_modifier_group_index]
  if (!group) {
    await sendWhatsAppTextMessage(phone, `Added ${item.name} to your cart.`)
    await showCart(phone, session.id)
    return
  }

  const body = `*${group.name}*${group.is_required ? ' (Required)' : ''}\nPick ${group.min_selections}${group.max_selections > group.min_selections ? `-${group.max_selections}` : ''}`

  if (group.modifiers.length <= 3) {
    const buttons: ReplyButton[] = group.modifiers.map((mod) => ({
      id: `mod:${mod.id}`,
      title: `${mod.name}${mod.price_delta_cents > 0 ? ' +' + formatPrice(mod.price_delta_cents) : ''}`.substring(0, 20),
    }))
    if (!group.is_required) {
      buttons.push({ id: 'skip_mod', title: 'Skip' })
    }
    await sendWhatsAppReplyButtons(phone, body, buttons)
  } else {
    const sections: ListSection[] = [
      {
        title: group.name,
        rows: group.modifiers.map((mod) => ({
          id: `mod:${mod.id}`,
          title: mod.name.substring(0, 24),
          description: mod.price_delta_cents > 0 ? `+${formatPrice(mod.price_delta_cents)}` : undefined,
        })),
      },
    ]
    await sendWhatsAppListMessage(phone, group.name, body, sections, 'Select Option')
  }
}

async function showCart(phone: string, sessionId: string) {
  const cart = await getCart(sessionId)
  if (cart.length === 0) {
    await sendWhatsAppTextMessage(phone, 'Your cart is empty.')
    return
  }

  let total = 0
  const lines = cart.map((item, i) => {
    const itemTotal = (item.priceCents + item.modifiers.reduce((s, m) => s + m.priceDeltaCents, 0)) * item.quantity
    total += itemTotal
    const mods = item.modifiers.length > 0 ? ` (${item.modifiers.map((m) => m.name).join(', ')})` : ''
    return `${i + 1}. ${item.name}${mods} x${item.quantity} — ${formatPrice(itemTotal)}`
  })

  const body = `*Your Cart*\n\n${lines.join('\n')}\n\n*Total: ${formatPrice(total)}*`
  const buttons: ReplyButton[] = [
    { id: 'checkout', title: 'Checkout' },
    { id: 'menu', title: 'Add More' },
    { id: 'clear_cart', title: 'Clear Cart' },
  ]

  await sendWhatsAppReplyButtons(phone, body, buttons)
}

async function sendOrderStatus(phone: string, customerId: string) {
  const supabase = getSupabaseServiceClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, total_cents, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(3)

  if (!orders || orders.length === 0) {
    await sendWhatsAppTextMessage(phone, 'You have no recent orders.')
    return
  }

  const lines = orders.map((o) => {
    const date = new Date(o.created_at).toLocaleDateString('en-MY')
    return `#${o.order_number} — ${o.status} — ${formatPrice(o.total_cents)} (${date})`
  })

  await sendWhatsAppTextMessage(phone, `*Recent Orders*\n\n${lines.join('\n')}`)
}

async function sendConfirmation(phone: string, session: BotSession, customerName: string) {
  const cart = await getCart(session.id)
  if (cart.length === 0) {
    await sendWhatsAppTextMessage(phone, 'Your cart is empty.')
    return
  }

  let subtotal = 0
  const lines = cart.map((item) => {
    const itemTotal = (item.priceCents + item.modifiers.reduce((s, m) => s + m.priceDeltaCents, 0)) * item.quantity
    subtotal += itemTotal
    const mods = item.modifiers.length > 0 ? ` (${item.modifiers.map((m) => m.name).join(', ')})` : ''
    return `${item.name}${mods} x${item.quantity} — ${formatPrice(itemTotal)}`
  })

  const address = session.address_json
    ? formatAddressForBot(session.address_json as unknown as { address_line1: string; address_line2?: string; city?: string; state?: string; postal_code?: string; country?: string })
    : 'Not provided'

  const contact = session.contact_json
    ? `${(session.contact_json as Record<string, string>).name || ''} ${(session.contact_json as Record<string, string>).phone || ''}`.trim()
    : 'Not provided'

  const body = `*Order Summary*\n\n${lines.join('\n')}\n\n*Subtotal:* ${formatPrice(subtotal)}\n*Delivery:* Calculated at checkout\n\n*Deliver to:* ${address}\n*Contact:* ${contact}\n\nTap Confirm to proceed to payment.`

  const buttons: ReplyButton[] = [
    { id: 'confirm_pay', title: 'Confirm & Pay' },
    { id: 'edit_cart', title: 'Edit Cart' },
    { id: 'cancel', title: 'Cancel' },
  ]

  await sendWhatsAppReplyButtons(phone, body, buttons)
}

async function createCheckout(session: BotSession, customerId: string): Promise<string | null> {
  const cart = await getCart(session.id)
  if (cart.length === 0) return null

  const address = session.address_json as Record<string, string> | null
  const contact = session.contact_json as Record<string, string> | null

  if (!address || !contact) return null

  const items = cart.map((item) => ({
    id: item.menuItemId,
    name: item.name,
    quantity: item.quantity,
    price_cents: item.priceCents,
    modifiers: item.modifiers.map((m) => ({
      id: m.modifierId,
      name: m.name,
      price_delta_cents: m.priceDeltaCents,
    })),
  }))

  const deliveryAddress = {
    fullName: contact.name || 'Customer',
    phone: contact.phone || '',
    address: address.address_line1 || '',
    city: address.city || 'Shah Alam',
    state: address.state || 'Selangor',
    postalCode: address.postal_code || '',
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
  }

  try {
    const geo = await geocodeAddress({
      address_line1: deliveryAddress.address,
      city: deliveryAddress.city,
      state: deliveryAddress.state,
      postal_code: deliveryAddress.postalCode,
    })

    if (geo) {
      deliveryAddress.latitude = geo.latitude
      deliveryAddress.longitude = geo.longitude
    }
  } catch {
  }

  const response = await fetch(`${env.NEXT_PUBLIC_URL}/api/bots/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId,
      items,
      deliveryAddress,
      deliveryFee: 0,
    }),
  })

  if (!response.ok) {
    console.error('[WhatsAppWebhook] Checkout API error:', response.status)
    return null
  }

  const data = await response.json()
  return data.checkoutUrl || null
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Verification failed', { status: 403 })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const msg = extractMessage(body)

    if (!msg || !msg.from) {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const phone = msg.from
    const text = getMessageText(msg)
    const lowerText = text.toLowerCase()

    const settings = await getFreshBotSettings()

    if (!isBotEnabled(settings, 'whatsapp')) {
      await sendWhatsAppTextMessage(
        phone,
        'Sorry, our WhatsApp ordering is currently unavailable. Please order via the website.'
      )
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const hours = getOperatingHoursForBot(settings)
    if (!hours.isOpen) {
      await sendWhatsAppTextMessage(
        phone,
        `Sorry, we are currently closed. Our hours are ${hours.open}–${hours.close}.`
      )
      return NextResponse.json({ success: true }, { status: 200 })
    }

    const session = await getOrCreateSession('whatsapp', phone)
    const supabase = getSupabaseServiceClient()
    const customer = await findOrCreateBotCustomer('whatsapp', phone, {})

    if (lowerText === 'cancel') {
      await clearSession(session.id)
      await sendWhatsAppTextMessage(phone, 'Your session has been cleared. Send "Menu" to start over.')
      return NextResponse.json({ success: true }, { status: 200 })
    }

    if (lowerText === 'status') {
      await sendOrderStatus(phone, customer.id)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    if (lowerText === 'cart') {
      await showCart(phone, session.id)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    if (['hi', 'hello', 'menu', 'start'].includes(lowerText)) {
      const menu = await getBotMenu(supabase)
      await updateState(session.id, 'browsing_menu')
      await sendWelcome(phone, menu)
      return NextResponse.json({ success: true }, { status: 200 })
    }

    switch (session.current_state) {
      case 'idle': {
        const menu = await getBotMenu(supabase)
        await updateState(session.id, 'browsing_menu')
        await sendWelcome(phone, menu)
        break
      }

      case 'browsing_menu': {
        if (text.startsWith('item:')) {
          const itemId = text.replace('item:', '')
          const item = await getBotItemWithModifiers(supabase, itemId)
          if (!item) {
            await sendWhatsAppTextMessage(phone, 'That item is no longer available.')
            break
          }
          await updateState(session.id, 'selecting_modifiers', {
            selectedItemId: itemId,
            selectedModifierGroupIndex: item.modifier_groups.length > 0 ? 0 : null,
          })
          await sendItemDetails(phone, item)
        } else {
          const menu = await getBotMenu(supabase)
          await sendWelcome(phone, menu)
        }
        break
      }

      case 'selecting_modifiers': {
        if (text === 'menu') {
          await updateState(session.id, 'browsing_menu', {
            selectedItemId: null,
            selectedModifierGroupIndex: null,
          })
          const menu = await getBotMenu(supabase)
          await sendWelcome(phone, menu)
          break
        }

        if (text.startsWith('add:')) {
          const itemId = text.replace('add:', '')
          const item = await getBotItemWithModifiers(supabase, itemId)
          if (!item) {
            await sendWhatsAppTextMessage(phone, 'Item unavailable.')
            break
          }

          if (item.modifier_groups.length > 0) {
            await updateState(session.id, 'selecting_modifiers', {
              selectedItemId: itemId,
              selectedModifierGroupIndex: 0,
            })
            await sendModifierSelection(phone, { ...session, selected_item_id: itemId, selected_modifier_group_index: 0 }, item)
          } else {
            await addToCart(session.id, {
              menuItemId: item.id,
              name: item.name,
              priceCents: item.price_cents,
              quantity: 1,
              modifiers: [],
            })
            await sendWhatsAppTextMessage(phone, `Added ${item.name} to your cart.`)
            await showCart(phone, session.id)
            await updateState(session.id, 'viewing_cart')
          }
          break
        }

        if (text.startsWith('mod:') || text === 'skip_mod') {
          const item = session.selected_item_id
            ? await getBotItemWithModifiers(supabase, session.selected_item_id)
            : null

          if (!item) {
            await sendWhatsAppTextMessage(phone, 'Session expired. Starting over.')
            await clearSession(session.id)
            const menu = await getBotMenu(supabase)
            await sendWelcome(phone, menu)
            break
          }

          const groupIndex = session.selected_modifier_group_index ?? 0
          const group = item.modifier_groups[groupIndex]
          const selectedModifiers: CartModifier[] = []

          if (text.startsWith('mod:') && group) {
            const modId = text.replace('mod:', '')
            const modifier = group.modifiers.find((m) => m.id === modId)
            if (modifier) {
              selectedModifiers.push({
                modifierId: modifier.id,
                name: modifier.name,
                priceDeltaCents: modifier.price_delta_cents,
              })
            }
          }

          const nextGroupIndex = groupIndex + 1
          const hasMoreGroups = nextGroupIndex < item.modifier_groups.length

          if (hasMoreGroups) {
            const cart = await getCart(session.id)
            const existingItem = cart.find((c) => c.menuItemId === item.id)

            if (existingItem) {
              const updatedCart = cart.map((c) =>
                c.menuItemId === item.id
                  ? { ...c, modifiers: [...c.modifiers, ...selectedModifiers] }
                  : c
              )
              await supabase
                .from('bot_sessions')
                .update({ cart_json: updatedCart, last_interaction_at: new Date().toISOString() })
                .eq('id', session.id)
            } else {
              await addToCart(session.id, {
                menuItemId: item.id,
                name: item.name,
                priceCents: item.price_cents,
                quantity: 1,
                modifiers: selectedModifiers,
              })
            }

            await updateState(session.id, 'selecting_modifiers', {
              selectedModifierGroupIndex: nextGroupIndex,
            })
            await sendModifierSelection(
              phone,
              { ...session, selected_modifier_group_index: nextGroupIndex },
              item
            )
          } else {
            const cart = await getCart(session.id)
            const existingItem = cart.find((c) => c.menuItemId === item.id)

            if (existingItem) {
              const updatedCart = cart.map((c) =>
                c.menuItemId === item.id
                  ? { ...c, modifiers: [...c.modifiers, ...selectedModifiers] }
                  : c
              )
              await supabase
                .from('bot_sessions')
                .update({ cart_json: updatedCart, last_interaction_at: new Date().toISOString() })
                .eq('id', session.id)
            } else {
              await addToCart(session.id, {
                menuItemId: item.id,
                name: item.name,
                priceCents: item.price_cents,
                quantity: 1,
                modifiers: selectedModifiers,
              })
            }

            await sendWhatsAppTextMessage(phone, `Added ${item.name} to your cart.`)
            await showCart(phone, session.id)
            await updateState(session.id, 'viewing_cart', {
              selectedItemId: null,
              selectedModifierGroupIndex: null,
            })
          }
          break
        }

        const item = session.selected_item_id
          ? await getBotItemWithModifiers(supabase, session.selected_item_id)
          : null
        if (item) {
          await sendModifierSelection(phone, session, item)
        } else {
          await updateState(session.id, 'browsing_menu')
          const menu = await getBotMenu(supabase)
          await sendWelcome(phone, menu)
        }
        break
      }

      case 'viewing_cart': {
        if (text === 'checkout') {
          await updateState(session.id, 'entering_address')
          await sendWhatsAppTextMessage(
            phone,
            'Please enter your delivery address. Include street, city, state, and postal code.\n\nExample: 25 Jalan Universiti, Shah Alam, Selangor 40150'
          )
        } else if (text === 'menu' || text === 'add more') {
          await updateState(session.id, 'browsing_menu')
          const menu = await getBotMenu(supabase)
          await sendWelcome(phone, menu)
        } else if (text === 'clear_cart') {
          await clearSession(session.id)
          await sendWhatsAppTextMessage(phone, 'Cart cleared. Send "Menu" to start over.')
        } else {
          await showCart(phone, session.id)
        }
        break
      }

      case 'entering_address': {
        const parsed = parseAddressInput(text)
        const validation = await validateAddress(supabase, parsed)

        if (!validation.valid) {
          await sendWhatsAppTextMessage(
            phone,
            `Invalid address: ${validation.errors.join(', ')}. Please try again.`
          )
          break
        }

        try {
          const geo = await geocodeAddress(parsed)
          if (geo) {
            const inside = await isWithinDeliveryZone(supabase, geo.latitude, geo.longitude)
            if (!inside) {
              await sendWhatsAppTextMessage(
                phone,
                'Sorry, that address is outside our delivery zone. We currently only deliver to Shah Alam, Selangor.'
              )
              break
            }
          }
        } catch {
          // Continue without geocoding
        }

        await updateState(session.id, 'entering_contact', {
          address: parsed as Record<string, unknown>,
        })
        await sendWhatsAppTextMessage(
          phone,
          'Great! Now please provide your name and phone number.\n\nExample: Ahmad, +60123456789'
        )
        break
      }

      case 'entering_contact': {
        const parts = text.split(',').map((p) => p.trim())
        const name = parts[0] || text
        const phoneMatch = text.match(/(\+?60[\d\-]{8,12})/)
        const contactPhone = phoneMatch ? phoneMatch[1] : phone

        await updateBotCustomerContact(customer.id, { name, phone: contactPhone })
        await updateState(session.id, 'confirming_order', {
          contact: { name, phone: contactPhone },
        })
        await sendConfirmation(phone, { ...session, contact_json: { name, phone: contactPhone } }, name)
        break
      }

      case 'confirming_order': {
        if (text === 'confirm_pay') {
          await updateState(session.id, 'awaiting_payment')
          const checkoutUrl = await createCheckout(session, customer.id)

          if (checkoutUrl) {
            await sendWhatsAppTextMessage(
              phone,
              `Please complete your payment here:\n${checkoutUrl}\n\nYour order will be prepared once payment is confirmed.`
            )
          } else {
            await sendWhatsAppTextMessage(
              phone,
              'Sorry, we could not create a checkout session. Please try again later.'
            )
            await updateState(session.id, 'viewing_cart')
          }
        } else if (text === 'edit_cart') {
          await updateState(session.id, 'viewing_cart')
          await showCart(phone, session.id)
        } else if (text === 'cancel') {
          await clearSession(session.id)
          await sendWhatsAppTextMessage(phone, 'Order cancelled. Send "Menu" to start over.')
        } else {
          await sendConfirmation(phone, session, customer.name || 'Customer')
        }
        break
      }

      case 'awaiting_payment':
      case 'complete': {
        await sendWhatsAppTextMessage(
          phone,
          'Send "Menu" to place a new order, or "Status" to check your orders.'
        )
        break
      }

      default: {
        const menu = await getBotMenu(supabase)
        await updateState(session.id, 'browsing_menu')
        await sendWelcome(phone, menu)
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[WhatsAppWebhook] Error:', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
