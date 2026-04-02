import type { LalamoveCityInfo, LalamoveApiResponse } from './types'
import type { LalamoveTransport } from './transport'

interface CachedCityInfo {
  city: LalamoveCityInfo
  cachedAt: number
}

let cache: CachedCityInfo | null = null

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Fetch city info from Lalamove v3 API.
 */
async function fetchCityInfo(
  transport: LalamoveTransport,
  cityName: string
): Promise<LalamoveCityInfo> {
  const response = await transport.get<LalamoveApiResponse<LalamoveCityInfo[]>>(
    '/v3/cities?countryIso2=MY'
  )

  const cities = response.data

  const match = cities.find(
    (c) => c.name.toLowerCase() === cityName.toLowerCase()
  )

  if (!match) {
    const available = cities.map((c) => c.name).join(', ')
    throw new Error(
      `City "${cityName}" not found in Lalamove MY cities. Available: ${available}`
    )
  }

  return match
}

/**
 * Get city info with caching.
 *
 * Resolves the active Malaysian city from Lalamove's /v3/cities endpoint.
 * Cached for 24 hours to avoid excessive API calls.
 *
 * @param transport - Lalamove transport instance
 * @param cityName - City name to resolve (e.g., "Shah Alam")
 * @returns City info with available services and special requests
 */
export async function getCityInfo(
  transport: LalamoveTransport,
  cityName: string
): Promise<LalamoveCityInfo> {
  const now = Date.now()

  if (cache && now - cache.cachedAt < CACHE_TTL_MS) {
    return cache.city
  }

  const city = await fetchCityInfo(transport, cityName)
  cache = { city, cachedAt: now }
  return city
}

/**
 * Check if a service type is available in the given city.
 */
export function isServiceAvailable(
  city: LalamoveCityInfo,
  serviceType: string
): boolean {
  return city.services.some((s) => s.serviceType === serviceType)
}

/**
 * Check if item specification is supported in the given city.
 */
export function supportsItemSpecification(city: LalamoveCityInfo): boolean {
  return !!city.deliveryItemSpecification
}

/**
 * Clear the city info cache (useful for testing).
 */
export function clearCityInfoCache(): void {
  cache = null
}

/**
 * Get cached city info without fetching (for testing).
 */
export function getCachedCityInfo(): CachedCityInfo | null {
  return cache
}
