import { createServerClient } from '@supabase/ssr'
import { type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

export type BotPlatform = 'telegram' | 'whatsapp'

export interface BotSettings {
  telegram_bot_enabled: boolean
  whatsapp_bot_enabled: boolean
  telegram_kitchen_group_chat_id: string | null
  delivery_geofence_json: GeoJSONPolygon | null
  operating_hours: Record<string, { open: string; close: string }> | null
  min_order_amount: number
  store_name: string
}

export interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: number[][][]
}

function getBotServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      '[BotSettings] Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
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

async function fetchBotSettings(): Promise<BotSettings | null> {
  const supabase = getBotServiceClient()

  const { data, error } = await supabase
    .from('store_settings')
    .select(
      'telegram_bot_enabled, whatsapp_bot_enabled, telegram_kitchen_group_chat_id, delivery_geofence_json, operating_hours, min_order_amount, store_name'
    )
    .limit(1)
    .single()

  if (error || !data) {
    console.error('[BotSettings] Failed to fetch settings:', error)
    return null
  }

  return {
    telegram_bot_enabled: data.telegram_bot_enabled ?? false,
    whatsapp_bot_enabled: data.whatsapp_bot_enabled ?? false,
    telegram_kitchen_group_chat_id: data.telegram_kitchen_group_chat_id ?? null,
    delivery_geofence_json: data.delivery_geofence_json as GeoJSONPolygon | null,
    operating_hours: data.operating_hours as Record<string, { open: string; close: string }> | null,
    min_order_amount: data.min_order_amount ?? 2000,
    store_name: data.store_name ?? 'Mad Krapow',
  }
}

export const getBotSettings = unstable_cache(
  fetchBotSettings,
  ['bot-settings'],
  { revalidate: 60 }
)

export async function getFreshBotSettings(): Promise<BotSettings | null> {
  return fetchBotSettings()
}

export function isBotEnabled(settings: BotSettings | null, platform: BotPlatform): boolean {
  if (!settings) return false
  return platform === 'telegram'
    ? (settings.telegram_bot_enabled ?? false)
    : (settings.whatsapp_bot_enabled ?? false)
}

export interface OperatingHoursResult {
  isOpen: boolean
  open: string | null
  close: string | null
}

export function getOperatingHoursForBot(
  settings: BotSettings | null,
  date: Date = new Date()
): OperatingHoursResult {
  if (!settings?.operating_hours) {
    return { isOpen: true, open: null, close: null }
  }

  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const dayOfWeek = dayNames[date.getDay()]
  const dayHours = settings.operating_hours[dayOfWeek]

  if (!dayHours?.open || !dayHours?.close) {
    return { isOpen: false, open: null, close: null }
  }

  const [openH, openM] = dayHours.open.split(':').map(Number)
  const [closeH, closeM] = dayHours.close.split(':').map(Number)
  const currentH = date.getHours()
  const currentM = date.getMinutes()

  const currentMinutes = currentH * 60 + currentM
  const openMinutes = openH * 60 + openM
  const closeMinutes = closeH * 60 + closeM

  const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes

  return {
    isOpen,
    open: dayHours.open,
    close: dayHours.close,
  }
}

export function getGeofence(settings: BotSettings | null): GeoJSONPolygon | null {
  if (!settings?.delivery_geofence_json) return null

  const geofence = settings.delivery_geofence_json
  if (geofence.type !== 'Polygon' || !Array.isArray(geofence.coordinates)) {
    console.warn('[BotSettings] Invalid geofence format:', geofence)
    return null
  }

  return geofence
}

export function getKitchenGroupChatId(settings: BotSettings | null): string | null {
  return settings?.telegram_kitchen_group_chat_id ?? null
}

export function validateGeofenceJson(json: unknown): { valid: boolean; error?: string } {
  if (!json || typeof json !== 'object') {
    return { valid: false, error: 'Geofence must be a GeoJSON object' }
  }

  const geofence = json as Record<string, unknown>

  if (geofence.type !== 'Polygon') {
    return { valid: false, error: 'Geofence type must be "Polygon"' }
  }

  if (!Array.isArray(geofence.coordinates)) {
    return { valid: false, error: 'Geofence coordinates must be an array' }
  }

  // Validate polygon structure: coordinates[0] should be an array of [lng, lat] pairs
  const rings = geofence.coordinates as unknown[][]
  if (rings.length === 0) {
    return { valid: false, error: 'Geofence must have at least one ring' }
  }

  const outerRing = rings[0]
  if (!Array.isArray(outerRing) || outerRing.length < 4) {
    return { valid: false, error: 'Geofence ring must have at least 4 points (including closing point)' }
  }

  for (const point of outerRing) {
    if (!Array.isArray(point) || point.length !== 2) {
      return { valid: false, error: 'Each coordinate point must be [longitude, latitude]' }
    }
    const [lng, lat] = point as number[]
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return { valid: false, error: 'Coordinates must be numbers' }
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return { valid: false, error: 'Coordinates out of valid range' }
    }
  }

  const firstPoint = outerRing[0] as number[]
  const lastPoint = outerRing[outerRing.length - 1] as number[]
  if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
    return { valid: false, error: 'Polygon ring must be closed (first point equals last point)' }
  }

  const firstRing = rings[0]
  if (!Array.isArray(firstRing) || firstRing.length < 4) {
    return { valid: false, error: 'Geofence ring must have at least 4 points (including closing point)' }
  }

  // Check each point is [lng, lat]
  for (const point of firstRing) {
    if (!Array.isArray(point) || point.length !== 2) {
      return { valid: false, error: 'Each coordinate point must be [longitude, latitude]' }
    }
    const [lng, lat] = point as number[]
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return { valid: false, error: 'Coordinates must be numbers' }
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return { valid: false, error: 'Coordinates out of valid range' }
    }
  }

  // Check first and last points match (closed polygon)
  const first = firstRing[0] as number[]
  const last = firstRing[firstRing.length - 1] as number[]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { valid: false, error: 'Polygon ring must be closed (first point equals last point)' }
  }

  return { valid: true }
}
