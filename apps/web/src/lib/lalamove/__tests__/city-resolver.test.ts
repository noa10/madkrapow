import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCityInfo,
  isServiceAvailable,
  supportsItemSpecification,
  clearCityInfoCache,
  getCachedCityInfo,
} from '../city-resolver'
import type { LalamoveCityInfo, LalamoveApiResponse } from '../types'

// Mock transport
function createMockTransport(cities: LalamoveCityInfo[]) {
  return {
    get: vi.fn().mockResolvedValue({ data: cities } as LalamoveApiResponse<LalamoveCityInfo[]>),
    post: vi.fn(),
    del: vi.fn(),
  }
}

const SHAH_ALAM_CITY: LalamoveCityInfo = {
  name: 'Shah Alam',
  country: 'MY',
  services: [
    { serviceType: 'MOTORCYCLE', description: 'Motorcycle' },
    { serviceType: 'CAR', description: 'Car' },
  ],
  specialRequests: [{ name: 'TOLL_FEE' }],
}

const KL_CITY: LalamoveCityInfo = {
  name: 'Kuala Lumpur',
  country: 'MY',
  services: [
    { serviceType: 'MOTORCYCLE', description: 'Motorcycle' },
    { serviceType: 'CAR', description: 'Car' },
    { serviceType: 'VAN', description: 'Van' },
  ],
  deliveryItemSpecification: { weight: ['LESS_THAN_3KG'] },
}

describe('getCityInfo', () => {
  beforeEach(() => {
    clearCityInfoCache()
  })

  it('resolves city by name (case insensitive)', async () => {
    const transport = createMockTransport([SHAH_ALAM_CITY, KL_CITY])

    const city = await getCityInfo(transport as never, 'shah alam')
    expect(city.name).toBe('Shah Alam')
  })

  it('calls /v3/cities endpoint', async () => {
    const transport = createMockTransport([SHAH_ALAM_CITY])

    await getCityInfo(transport as never, 'Shah Alam')
    expect(transport.get).toHaveBeenCalledWith('/v3/cities?countryIso2=MY')
  })

  it('throws for unknown city', async () => {
    const transport = createMockTransport([SHAH_ALAM_CITY])

    await expect(
      getCityInfo(transport as never, 'Unknown City')
    ).rejects.toThrow('not found in Lalamove MY cities')
  })

  it('caches city info after first fetch', async () => {
    const transport = createMockTransport([SHAH_ALAM_CITY])

    await getCityInfo(transport as never, 'Shah Alam')
    await getCityInfo(transport as never, 'Shah Alam')

    // Should only call transport once due to caching
    expect(transport.get).toHaveBeenCalledTimes(1)
  })

  it('returns cached result within TTL', async () => {
    const transport = createMockTransport([SHAH_ALAM_CITY])

    await getCityInfo(transport as never, 'Shah Alam')
    const cached = getCachedCityInfo()

    expect(cached).not.toBeNull()
    expect(cached!.city.name).toBe('Shah Alam')
  })
})

describe('isServiceAvailable', () => {
  it('returns true for available service', () => {
    expect(isServiceAvailable(SHAH_ALAM_CITY, 'MOTORCYCLE')).toBe(true)
    expect(isServiceAvailable(SHAH_ALAM_CITY, 'CAR')).toBe(true)
  })

  it('returns false for unavailable service', () => {
    expect(isServiceAvailable(SHAH_ALAM_CITY, 'VAN')).toBe(false)
  })
})

describe('supportsItemSpecification', () => {
  it('returns true when deliveryItemSpecification exists', () => {
    expect(supportsItemSpecification(KL_CITY)).toBe(true)
  })

  it('returns false when deliveryItemSpecification is missing', () => {
    expect(supportsItemSpecification(SHAH_ALAM_CITY)).toBe(false)
  })
})

describe('clearCityInfoCache', () => {
  it('clears the cache', async () => {
    const transport = createMockTransport([SHAH_ALAM_CITY])

    await getCityInfo(transport as never, 'Shah Alam')
    expect(getCachedCityInfo()).not.toBeNull()

    clearCityInfoCache()
    expect(getCachedCityInfo()).toBeNull()
  })
})
