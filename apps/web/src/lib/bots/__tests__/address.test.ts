import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseAddressInput,
  validateAddress,
  isWithinDeliveryZone,
  geocodeAddress,
  formatAddressForBot,
  type ParsedAddress,
} from '../address'

vi.mock('@/lib/validators/env', () => ({
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_KEY: 'test-google-maps-key',
  },
}))

function buildMockSupabaseClient(response: { data: unknown; error: unknown }) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(response),
        }),
      }),
    }),
  }
}

describe('parseAddressInput', () => {
  it('parses full address with all components', () => {
    const text = '123 Jalan Universiti, Shah Alam, Selangor, 40150, Malaysia'
    const result = parseAddressInput(text)
    expect(result.address_line1).toBe('123 Jalan Universiti')
    expect(result.city).toBe('Shah Alam')
    expect(result.state).toBe('Selangor')
    expect(result.postal_code).toBe('40150')
    expect(result.country).toBe('Malaysia')
  })

  it('parses address without country', () => {
    const text = '456 Jalan SS15, Subang Jaya, Selangor, 47500'
    const result = parseAddressInput(text)
    expect(result.address_line1).toBe('456 Jalan SS15')
    expect(result.city).toBe('Subang Jaya')
    expect(result.state).toBe('Selangor')
    expect(result.postal_code).toBe('47500')
    expect(result.country).toBeUndefined()
  })

  it('parses Kuala Lumpur address', () => {
    const text = '789 Jalan Bukit Bintang, Kuala Lumpur, 55100'
    const result = parseAddressInput(text)
    expect(result.city).toBe('Kuala Lumpur')
    expect(result.state).toBeUndefined()
    expect(result.postal_code).toBe('55100')
  })

  it('parses Petaling Jaya address', () => {
    const text = '10 Jalan Universiti, Petaling Jaya, Selangor, 46350'
    const result = parseAddressInput(text)
    expect(result.city).toBe('Petaling Jaya')
    expect(result.state).toBe('Selangor')
  })

  it('handles text without postal code', () => {
    const text = 'Some Street, Shah Alam, Selangor'
    const result = parseAddressInput(text)
    expect(result.postal_code).toBeUndefined()
    expect(result.city).toBe('Shah Alam')
    expect(result.state).toBe('Selangor')
  })

  it('uses full text as address_line1 when no patterns match', () => {
    const text = 'Unknown Place Somewhere'
    const result = parseAddressInput(text)
    expect(result.address_line1).toBe('Unknown Place Somewhere')
    expect(result.city).toBeUndefined()
    expect(result.state).toBeUndefined()
  })
})

describe('validateAddress', () => {
  it('validates correct Shah Alam address', async () => {
    const address: ParsedAddress = {
      address_line1: '123 Jalan Universiti',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '40150',
      country: 'Malaysia',
    }

    const mockSupabase = buildMockSupabaseClient({ data: null, error: null })
    const result = await validateAddress(mockSupabase as never, address)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('fails for missing required fields', async () => {
    const address: ParsedAddress = {
      address_line1: '',
      city: undefined,
      state: undefined,
      postal_code: undefined,
    }

    const mockSupabase = buildMockSupabaseClient({ data: null, error: null })
    const result = await validateAddress(mockSupabase as never, address)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('address_line1 is required')
    expect(result.errors).toContain('city is required')
    expect(result.errors).toContain('state is required')
    expect(result.errors).toContain('postal_code is required')
  })

  it('fails for wrong city', async () => {
    const address: ParsedAddress = {
      address_line1: '123 Main St',
      city: 'Kuala Lumpur',
      state: 'Selangor',
      postal_code: '40150',
      country: 'Malaysia',
    }

    const mockSupabase = buildMockSupabaseClient({ data: null, error: null })
    const result = await validateAddress(mockSupabase as never, address)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('We only deliver to Shah Alam')
  })

  it('fails for wrong state', async () => {
    const address: ParsedAddress = {
      address_line1: '123 Main St',
      city: 'Shah Alam',
      state: 'Kuala Lumpur',
      postal_code: '40150',
      country: 'Malaysia',
    }

    const mockSupabase = buildMockSupabaseClient({ data: null, error: null })
    const result = await validateAddress(mockSupabase as never, address)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('We only deliver within Selangor')
  })

  it('fails for wrong country', async () => {
    const address: ParsedAddress = {
      address_line1: '123 Main St',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '40150',
      country: 'Singapore',
    }

    const mockSupabase = buildMockSupabaseClient({ data: null, error: null })
    const result = await validateAddress(mockSupabase as never, address)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('We only deliver within Malaysia')
  })
})

describe('isWithinDeliveryZone', () => {
  it('returns true when no geofence configured', async () => {
    const mockSupabase = buildMockSupabaseClient({ data: null, error: { message: 'not found' } })
    const result = await isWithinDeliveryZone(mockSupabase as never, 3.0738, 101.5183)
    expect(result).toBe(true)
  })

  it('returns true when geofence is null', async () => {
    const mockSupabase = buildMockSupabaseClient({ data: { delivery_geofence_json: null }, error: null })
    const result = await isWithinDeliveryZone(mockSupabase as never, 3.0738, 101.5183)
    expect(result).toBe(true)
  })

  it('returns true when geofence is not a Polygon', async () => {
    const mockSupabase = buildMockSupabaseClient({
        data: { delivery_geofence_json: { type: 'Point', coordinates: [0, 0] } },
      error: null,
    })
    const result = await isWithinDeliveryZone(mockSupabase as never, 3.0738, 101.5183)
    expect(result).toBe(true)
  })

  it('returns true for point inside delivery zone', async () => {
    const geofence = {
      type: 'Polygon',
      coordinates: [
        [
          [101.4, 3.0],
          [101.6, 3.0],
          [101.6, 3.2],
          [101.4, 3.2],
          [101.4, 3.0],
        ],
      ],
    }
    const mockSupabase = buildMockSupabaseClient({ data: { delivery_geofence_json: geofence }, error: null })
    const result = await isWithinDeliveryZone(mockSupabase as never, 3.1, 101.5)
    expect(result).toBe(true)
  })

  it('returns false for point outside delivery zone', async () => {
    const geofence = {
      type: 'Polygon',
      coordinates: [
        [
          [101.4, 3.0],
          [101.6, 3.0],
          [101.6, 3.2],
          [101.4, 3.2],
          [101.4, 3.0],
        ],
      ],
    }
    const mockSupabase = buildMockSupabaseClient({ data: { delivery_geofence_json: geofence }, error: null })
    const result = await isWithinDeliveryZone(mockSupabase as never, 3.5, 101.5)
    expect(result).toBe(false)
  })

  it('handles polygon with hole (returns false if in hole)', async () => {
    const geofence = {
      type: 'Polygon',
      coordinates: [
        [
          [101.4, 3.0],
          [101.6, 3.0],
          [101.6, 3.2],
          [101.4, 3.2],
          [101.4, 3.0],
        ],
        [
          [101.45, 3.05],
          [101.55, 3.05],
          [101.55, 3.15],
          [101.45, 3.15],
          [101.45, 3.05],
        ],
      ],
    }
    const mockSupabase = buildMockSupabaseClient({ data: { delivery_geofence_json: geofence }, error: null })
    const result = await isWithinDeliveryZone(mockSupabase as never, 3.1, 101.5)
    expect(result).toBe(false)
  })
})

describe('geocodeAddress', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns geocode result for valid address', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'OK',
        results: [
          {
            geometry: {
              location: { lat: 3.0738, lng: 101.5183 },
            },
            formatted_address: '123 Jalan Universiti, Shah Alam, Selangor, Malaysia',
            place_id: 'place-123',
          },
        ],
      }),
    } as never)

    const address: ParsedAddress = {
      address_line1: '123 Jalan Universiti',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '40150',
      country: 'Malaysia',
    }

    const result = await geocodeAddress(address)
    expect(result).not.toBeNull()
    expect(result?.latitude).toBe(3.0738)
    expect(result?.longitude).toBe(101.5183)
    expect(result?.formatted_address).toContain('Shah Alam')
    expect(result?.place_id).toBe('place-123')
  })

  it('returns null for ZERO_RESULTS', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ZERO_RESULTS',
        results: [],
      }),
    } as never)

    const address: ParsedAddress = {
      address_line1: 'Nonexistent Place',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '00000',
      country: 'Malaysia',
    }

    const result = await geocodeAddress(address)
    expect(result).toBeNull()
  })

  it('throws when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    } as never)

    const address: ParsedAddress = {
      address_line1: '123 Main St',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '40150',
      country: 'Malaysia',
    }

    await expect(geocodeAddress(address)).rejects.toThrow('Geocoding request failed: 500')
  })

  it('throws when API key is missing', async () => {
    vi.resetModules()
    vi.doMock('@/lib/validators/env', () => ({
      env: {
        NEXT_PUBLIC_GOOGLE_MAPS_KEY: undefined,
      },
    }))

    const { geocodeAddress: geocodeAddressNoKey } = await import('../address')

    const address: ParsedAddress = {
      address_line1: '123 Main St',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '40150',
      country: 'Malaysia',
    }

    await expect(geocodeAddressNoKey(address)).rejects.toThrow('Google Maps API key is not configured')

    vi.doUnmock('@/lib/validators/env')
  })
})

describe('formatAddressForBot', () => {
  it('formats full address', () => {
    const address: ParsedAddress = {
      address_line1: '123 Jalan Universiti',
      address_line2: 'Block A',
      city: 'Shah Alam',
      state: 'Selangor',
      postal_code: '40150',
      country: 'Malaysia',
    }

    const result = formatAddressForBot(address)
    expect(result).toBe('123 Jalan Universiti, Block A, Shah Alam, Selangor, 40150, Malaysia')
  })

  it('formats minimal address', () => {
    const address: ParsedAddress = {
      address_line1: '123 Jalan Universiti',
    }

    const result = formatAddressForBot(address)
    expect(result).toBe('123 Jalan Universiti')
  })

  it('skips empty parts', () => {
    const address: ParsedAddress = {
      address_line1: '123 Main St',
      address_line2: '',
      city: 'Shah Alam',
      state: undefined,
      postal_code: '40150',
      country: '',
    }

    const result = formatAddressForBot(address)
    expect(result).toBe('123 Main St, Shah Alam, 40150')
  })
})
