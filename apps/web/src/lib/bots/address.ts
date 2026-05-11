import { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/validators/env'

export type ParsedAddress = {
  address_line1: string
  address_line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

export type AddressValidationResult = {
  valid: boolean
  errors: string[]
}

export type GeocodeResult = {
  latitude: number
  longitude: number
  formatted_address: string
  place_id: string
}

const REQUIRED_ADDRESS_FIELDS: (keyof ParsedAddress)[] = [
  'address_line1',
  'city',
  'state',
  'postal_code',
]

const VALID_CITY = 'Shah Alam'
const VALID_STATE = 'Selangor'
const VALID_COUNTRY = 'Malaysia'

export function parseAddressInput(text: string): ParsedAddress {
  const cleaned = text.replace(/\s+/g, ' ').trim()

  const postalMatch = cleaned.match(/(\d{5})/)
  const postal_code = postalMatch ? postalMatch[1] : undefined

  let remainder = postalMatch ? cleaned.replace(postalMatch[0], '').trim() : cleaned

  const cityPatterns = [
    { pattern: /shah\s*alam/i, city: 'Shah Alam' },
    { pattern: /kuala\s*lumpur/i, city: 'Kuala Lumpur' },
    { pattern: /petaling\s*jaya/i, city: 'Petaling Jaya' },
    { pattern: /subang\s*jaya/i, city: 'Subang Jaya' },
  ]

  let city: string | undefined
  for (const { pattern, city: matchedCity } of cityPatterns) {
    if (pattern.test(remainder)) {
      city = matchedCity
      remainder = remainder.replace(pattern, '').trim()
      break
    }
  }

  const statePatterns = [
    { pattern: /selangor/i, state: 'Selangor' },
    { pattern: /kuala\s*lumpur/i, state: 'Kuala Lumpur' },
  ]

  let state: string | undefined
  for (const { pattern, state: matchedState } of statePatterns) {
    if (pattern.test(remainder)) {
      state = matchedState
      remainder = remainder.replace(pattern, '').trim()
      break
    }
  }

  const countryPatterns = [
    { pattern: /malaysia/i, country: 'Malaysia' },
  ]

  let country: string | undefined
  for (const { pattern, country: matchedCountry } of countryPatterns) {
    if (pattern.test(remainder)) {
      country = matchedCountry
      remainder = remainder.replace(pattern, '').trim()
      break
    }
  }

  const parts = remainder.split(/,|\.\s*/).map((p) => p.trim()).filter(Boolean)

  const address_line1 = parts[0] || cleaned
  const address_line2 = parts.slice(1).join(', ') || undefined

  return {
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
  }
}

/**
 * Validate an address against store delivery rules.
 * Checks required fields and restricts delivery to Shah Alam, Selangor.
 */
export async function validateAddress(
  _supabase: SupabaseClient<any, any, any>,
  address: ParsedAddress
): Promise<AddressValidationResult> {
  const errors: string[] = []

  for (const field of REQUIRED_ADDRESS_FIELDS) {
    if (!address[field] || address[field].trim().length === 0) {
      errors.push(`${field} is required`)
    }
  }

  if (address.city && address.city.trim().toLowerCase() !== VALID_CITY.toLowerCase()) {
    errors.push(`We only deliver to ${VALID_CITY}`)
  }

  if (address.state && address.state.trim().toLowerCase() !== VALID_STATE.toLowerCase()) {
    errors.push(`We only deliver within ${VALID_STATE}`)
  }

  if (address.country && address.country.trim().toLowerCase() !== VALID_COUNTRY.toLowerCase()) {
    errors.push(`We only deliver within ${VALID_COUNTRY}`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

type GeoJSONPosition = [number, number]
type GeoJSONPolygon = {
  type: 'Polygon'
  coordinates: GeoJSONPosition[][]
}

function pointInRing(point: [number, number], ring: GeoJSONPosition[]): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi

    if (intersect) {
      inside = !inside
    }
  }

  return inside
}

function pointInPolygon(point: [number, number], polygon: GeoJSONPolygon): boolean {
  const [longitude, latitude] = point
  const geoPoint: GeoJSONPosition = [longitude, latitude]
  const rings = polygon.coordinates

  const inOuterRing = pointInRing(geoPoint, rings[0])
  if (!inOuterRing) return false

  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(geoPoint, rings[i])) return false
  }

  return true
}

export async function isWithinDeliveryZone(
  supabase: SupabaseClient<any, any, any>,
  lat: number,
  lng: number
): Promise<boolean> {
  const { data, error } = await supabase
    .from('store_settings')
    .select('delivery_geofence_json')
    .limit(1)
    .single()

  if (error || !data) return true

  const geofence = data.delivery_geofence_json as GeoJSONPolygon | null | undefined
  if (!geofence || geofence.type !== 'Polygon') return true

  return pointInPolygon([lng, lat], geofence)
}

// ─── Geocoding ───────────────────────────────────────────────────────────

/**
 * Geocode an address using the Google Maps Geocoding API.
 * Returns the first result's coordinates and formatted address.
 */
export async function geocodeAddress(
  address: ParsedAddress
): Promise<GeocodeResult | null> {
  const addressString = formatAddressForBot(address)
  const apiKey = env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

  if (!apiKey) {
    throw new Error('Google Maps API key is not configured')
  }

  const params = new URLSearchParams({
    address: addressString,
    key: apiKey,
    region: 'my',
  })

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status}`)
  }

  const data = await response.json()

  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    return null
  }

  const result = data.results[0]
  const location = result.geometry?.location

  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return null
  }

  return {
    latitude: location.lat,
    longitude: location.lng,
    formatted_address: result.formatted_address,
    place_id: result.place_id,
  }
}

// ─── Formatting ──────────────────────────────────────────────────────────

/**
 * Format a parsed address into a single line for bot order summaries.
 */
export function formatAddressForBot(address: ParsedAddress): string {
  const parts = [
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter((p): p is string => !!p && p.trim().length > 0)

  return parts.join(', ')
}
