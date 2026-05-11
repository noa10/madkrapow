import { createServerClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'

export type BotPlatform = 'telegram' | 'whatsapp'

export type ConversationState =
  | 'idle'
  | 'browsing_menu'
  | 'selecting_modifiers'
  | 'viewing_cart'
  | 'entering_address'
  | 'entering_contact'
  | 'confirming_order'
  | 'awaiting_payment'
  | 'complete'

export interface CartModifier {
  modifierId: string
  name: string
  priceDeltaCents: number
}

export interface CartItem {
  menuItemId: string
  name: string
  priceCents: number
  quantity: number
  modifiers: CartModifier[]
}

export interface BotSession {
  id: string
  platform: BotPlatform
  platform_user_id: string
  current_state: ConversationState
  cart_json: CartItem[]
  address_json: Record<string, unknown> | null
  contact_json: Record<string, unknown> | null
  selected_item_id: string | null
  selected_modifier_group_index: number | null
  language: string
  created_at: string
  updated_at: string
  last_interaction_at: string
}

export interface SessionData {
  address?: Record<string, unknown>
  contact?: Record<string, unknown>
  selectedItemId?: string | null
  selectedModifierGroupIndex?: number | null
  language?: string
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000

const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  idle: ['browsing_menu', 'viewing_cart', 'entering_address', 'entering_contact'],
  browsing_menu: ['idle', 'selecting_modifiers', 'viewing_cart'],
  selecting_modifiers: ['browsing_menu', 'viewing_cart'],
  viewing_cart: ['browsing_menu', 'entering_address', 'idle'],
  entering_address: ['entering_contact', 'viewing_cart'],
  entering_contact: ['confirming_order', 'entering_address', 'viewing_cart'],
  confirming_order: ['awaiting_payment', 'viewing_cart', 'entering_contact'],
  awaiting_payment: ['complete', 'viewing_cart'],
  complete: ['idle'],
}

function getBotServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[BotConversation] Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
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

function isValidTransition(from: ConversationState, to: ConversationState): boolean {
  if (from === to) return true
  return VALID_TRANSITIONS[from].includes(to)
}

function isSessionExpired(lastInteractionAt: string): boolean {
  return Date.now() - new Date(lastInteractionAt).getTime() > SESSION_TIMEOUT_MS
}

export async function getOrCreateSession(
  platform: BotPlatform,
  platformUserId: string
): Promise<BotSession> {
  const supabase = getBotServiceClient()

  const { data: existing, error: findError } = await supabase
    .from('bot_sessions')
    .select('*')
    .eq('platform', platform)
    .eq('platform_user_id', platformUserId)
    .maybeSingle()

  if (findError) {
    console.error('[BotConversation] Find session failed:', findError)
    throw new Error(`Failed to find bot session: ${findError.message}`)
  }

  if (existing) {
    const session = normalizeSession(existing)

    if (isSessionExpired(session.last_interaction_at)) {
      return clearSession(session.id)
    }

    const { data: touched, error: touchError } = await supabase
      .from('bot_sessions')
      .update({ last_interaction_at: new Date().toISOString() })
      .eq('id', session.id)
      .select('*')
      .single()

    if (touchError || !touched) {
      return session
    }

    return normalizeSession(touched)
  }

  const { data: created, error: insertError } = await supabase
    .from('bot_sessions')
    .insert({
      platform,
      platform_user_id: platformUserId,
      current_state: 'idle',
      cart_json: [],
      last_interaction_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced, error: raceError } = await supabase
        .from('bot_sessions')
        .select('*')
        .eq('platform', platform)
        .eq('platform_user_id', platformUserId)
        .maybeSingle()

      if (raceError) {
        throw new Error(`Race-resolution find failed: ${raceError.message}`)
      }
      if (raced) {
        return normalizeSession(raced)
      }
    }

    console.error('[BotConversation] Create session failed:', insertError)
    throw new Error(`Failed to create bot session: ${insertError.message}`)
  }

  if (!created) {
    throw new Error('Bot session insert returned no data')
  }

  return normalizeSession(created)
}

export async function updateState(
  sessionId: string,
  newState: ConversationState,
  data?: SessionData
): Promise<BotSession> {
  const supabase = getBotServiceClient()

  const { data: current, error: fetchError } = await supabase
    .from('bot_sessions')
    .select('current_state')
    .eq('id', sessionId)
    .single()

  if (fetchError || !current) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  const fromState = current.current_state as ConversationState

  if (!isValidTransition(fromState, newState)) {
    throw new Error(`Invalid state transition: ${fromState} → ${newState}`)
  }

  const updatePayload: Record<string, unknown> = {
    current_state: newState,
    last_interaction_at: new Date().toISOString(),
  }

  if (data) {
    if (data.address !== undefined) updatePayload.address_json = data.address
    if (data.contact !== undefined) updatePayload.contact_json = data.contact
    if (data.selectedItemId !== undefined) updatePayload.selected_item_id = data.selectedItemId
    if (data.selectedModifierGroupIndex !== undefined) {
      updatePayload.selected_modifier_group_index = data.selectedModifierGroupIndex
    }
    if (data.language !== undefined) updatePayload.language = data.language
  }

  const { data: updated, error } = await supabase
    .from('bot_sessions')
    .update(updatePayload)
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error) {
    console.error('[BotConversation] State update failed:', error)
    throw new Error(`Failed to update session state: ${error.message}`)
  }

  if (!updated) {
    throw new Error(`Session not found during update: ${sessionId}`)
  }

  return normalizeSession(updated)
}

export async function addToCart(sessionId: string, item: CartItem): Promise<BotSession> {
  const supabase = getBotServiceClient()

  const { data: session, error: fetchError } = await supabase
    .from('bot_sessions')
    .select('cart_json')
    .eq('id', sessionId)
    .single()

  if (fetchError || !session) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  const cart = normalizeCart(session.cart_json)
  cart.push(item)

  const { data: updated, error } = await supabase
    .from('bot_sessions')
    .update({
      cart_json: cart,
      last_interaction_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error || !updated) {
    throw new Error(`Failed to add item to cart: ${error?.message ?? 'unknown'}`)
  }

  return normalizeSession(updated)
}

export async function removeFromCart(sessionId: string, itemIndex: number): Promise<BotSession> {
  const supabase = getBotServiceClient()

  const { data: session, error: fetchError } = await supabase
    .from('bot_sessions')
    .select('cart_json')
    .eq('id', sessionId)
    .single()

  if (fetchError || !session) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  const cart = normalizeCart(session.cart_json)

  if (itemIndex < 0 || itemIndex >= cart.length) {
    throw new Error(`Invalid cart item index: ${itemIndex} (cart has ${cart.length} items)`)
  }

  const newCart = cart.filter((_, i) => i !== itemIndex)

  const { data: updated, error } = await supabase
    .from('bot_sessions')
    .update({
      cart_json: newCart,
      last_interaction_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error || !updated) {
    throw new Error(`Failed to remove item from cart: ${error?.message ?? 'unknown'}`)
  }

  return normalizeSession(updated)
}

export async function getCart(sessionId: string): Promise<CartItem[]> {
  const supabase = getBotServiceClient()

  const { data: session, error } = await supabase
    .from('bot_sessions')
    .select('cart_json')
    .eq('id', sessionId)
    .single()

  if (error || !session) {
    throw new Error(`Session not found: ${sessionId}`)
  }

  return normalizeCart(session.cart_json)
}

export async function clearSession(sessionId: string): Promise<BotSession> {
  const supabase = getBotServiceClient()

  const { data: updated, error } = await supabase
    .from('bot_sessions')
    .update({
      current_state: 'idle',
      cart_json: [],
      address_json: null,
      contact_json: null,
      selected_item_id: null,
      selected_modifier_group_index: null,
      last_interaction_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .single()

  if (error) {
    console.error('[BotConversation] Clear session failed:', error)
    throw new Error(`Failed to clear session: ${error.message}`)
  }

  if (!updated) {
    throw new Error(`Session not found during clear: ${sessionId}`)
  }

  return normalizeSession(updated)
}

function normalizeSession(raw: Record<string, unknown>): BotSession {
  return {
    id: raw.id as string,
    platform: raw.platform as BotPlatform,
    platform_user_id: raw.platform_user_id as string,
    current_state: raw.current_state as ConversationState,
    cart_json: normalizeCart(raw.cart_json),
    address_json: (raw.address_json as Record<string, unknown> | null) ?? null,
    contact_json: (raw.contact_json as Record<string, unknown> | null) ?? null,
    selected_item_id: (raw.selected_item_id as string | null) ?? null,
    selected_modifier_group_index:
      (raw.selected_modifier_group_index as number | null) ?? null,
    language: (raw.language as string) ?? 'en',
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
    last_interaction_at: raw.last_interaction_at as string,
  }
}

function normalizeCart(cartJson: unknown): CartItem[] {
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
