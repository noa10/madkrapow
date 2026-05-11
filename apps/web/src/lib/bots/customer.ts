import { createServerClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'

export type BotPlatform = 'telegram' | 'whatsapp'

export interface BotContactInfo {
  name?: string
  phone?: string
}

export interface BotCustomer {
  id: string
  auth_user_id: string | null
  telegram_id: string | null
  whatsapp_id: string | null
  name: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface CustomerForOrder extends BotCustomer {
  order_id: string
  order_status: string
}

function getBotServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[BotCustomer] Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
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

function platformIdColumn(platform: BotPlatform): 'telegram_id' | 'whatsapp_id' {
  return platform === 'telegram' ? 'telegram_id' : 'whatsapp_id'
}

export async function findOrCreateBotCustomer(
  platform: BotPlatform,
  platformUserId: string,
  contactInfo: BotContactInfo
): Promise<BotCustomer> {
  const supabase = getBotServiceClient()
  const idColumn = platformIdColumn(platform)

  const { data: existing, error: findError } = await supabase
    .from('customers')
    .select('id, auth_user_id, telegram_id, whatsapp_id, name, phone, created_at, updated_at')
    .eq(idColumn, platformUserId)
    .maybeSingle()

  if (findError) {
    console.error('[BotCustomer] Find failed:', findError)
    throw new Error(`Failed to look up bot customer: ${findError.message}`)
  }

  if (existing) {
    return existing as BotCustomer
  }

  const insertPayload: Record<string, unknown> = {
    auth_user_id: null,
    [idColumn]: platformUserId,
    name: contactInfo.name ?? null,
    phone: contactInfo.phone ?? null,
  }

  const { data: created, error: insertError } = await supabase
    .from('customers')
    .insert(insertPayload)
    .select('id, auth_user_id, telegram_id, whatsapp_id, name, phone, created_at, updated_at')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced, error: raceError } = await supabase
        .from('customers')
        .select('id, auth_user_id, telegram_id, whatsapp_id, name, phone, created_at, updated_at')
        .eq(idColumn, platformUserId)
        .maybeSingle()

      if (raceError) {
        throw new Error(`Race-resolution find failed: ${raceError.message}`)
      }
      if (raced) {
        return raced as BotCustomer
      }
    }

    console.error('[BotCustomer] Insert failed:', insertError)
    throw new Error(`Failed to create bot customer: ${insertError.message}`)
  }

  if (!created) {
    throw new Error('Bot customer insert returned no data')
  }

  return created as BotCustomer
}

export async function updateBotCustomerContact(
  customerId: string,
  contactInfo: BotContactInfo
): Promise<BotCustomer> {
  const supabase = getBotServiceClient()

  const updatePayload: Record<string, unknown> = {}
  if (contactInfo.name !== undefined) updatePayload.name = contactInfo.name
  if (contactInfo.phone !== undefined) updatePayload.phone = contactInfo.phone

  const { data: updated, error } = await supabase
    .from('customers')
    .update(updatePayload)
    .eq('id', customerId)
    .select('id, auth_user_id, telegram_id, whatsapp_id, name, phone, created_at, updated_at')
    .single()

  if (error) {
    console.error('[BotCustomer] Contact update failed:', error)
    throw new Error(`Failed to update bot customer contact: ${error.message}`)
  }

  if (!updated) {
    throw new Error(`Bot customer not found: ${customerId}`)
  }

  return updated as BotCustomer
}

export async function getCustomerForOrder(orderId: string): Promise<CustomerForOrder | null> {
  const supabase = getBotServiceClient()

  const { data, error } = await supabase
    .from('orders')
    .select(
      `
      id,
      status,
      customer:customer_id (
        id,
        auth_user_id,
        telegram_id,
        whatsapp_id,
        name,
        phone,
        created_at,
        updated_at
      )
    `
    )
    .eq('id', orderId)
    .maybeSingle()

  if (error) {
    console.error('[BotCustomer] getCustomerForOrder failed:', error)
    throw new Error(`Failed to fetch customer for order: ${error.message}`)
  }

  if (!data || !data.customer) {
    return null
  }

  const customer = Array.isArray(data.customer) ? data.customer[0] : data.customer

  return {
    ...(customer as unknown as BotCustomer),
    order_id: data.id as string,
    order_status: data.status as string,
  } as CustomerForOrder
}
