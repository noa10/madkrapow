'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Loader2, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCheckoutStore, type DeliveryAddress } from '@/stores/checkout'
import { env } from '@/lib/validators/env'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'

interface DeliveryAddressInputProps {
  onAddressSelect?: (address: DeliveryAddress) => void
  onQuoteFetched?: (quote: {
    quotation_id: string
    service_type: string
    fee_cents: number
    expires_at: string
  }) => void
  onQuoteError?: (error: string) => void
  deliveryRadiusKm?: number
}

const MALAYSIAN_STATES = [
  'Kuala Lumpur',
  'Selangor',
  'Putrajaya',
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perak',
  'Perlis',
  'Pulau Pinang',
  'Sabah',
  'Sarawak',
  'Terengganu',
  'Labuan'
]

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function DeliveryAddressInput({
  onAddressSelect,
  onQuoteFetched,
  onQuoteError,
  deliveryRadiusKm = 10
}: DeliveryAddressInputProps) {
  const { delivery_address, setDeliveryAddress, setShippingQuote } = useCheckoutStore()
  
  const { isLoaded, loadError } = useGoogleMaps()

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<DeliveryAddress>({
    full_name: delivery_address?.full_name || '',
    phone: delivery_address?.phone || '',
    address_line1: delivery_address?.address_line1 || '',
    address_line2: delivery_address?.address_line2 || '',
    city: delivery_address?.city || '',
    state: delivery_address?.state || '',
    postal_code: delivery_address?.postal_code || '',
    country: delivery_address?.country || 'Malaysia',
    latitude: delivery_address?.latitude,
    longitude: delivery_address?.longitude,
  })

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setSuggestions([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getAddressComponent = (
    components: google.maps.places.AddressComponent[] | undefined,
    type: string
  ) => {
    return components?.find((c) => c.types.includes(type))?.longText || ''
  }

  const handleSearchChange = useCallback(
    async (value: string) => {
      setQuery(value)
      setError(null)

      if (!value.trim() || !isLoaded) {
        setSuggestions([])
        return
      }

      try {
        const { suggestions: results } =
          await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: value,
            includedRegionCodes: ['my'],
            includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
          })
        setSuggestions(results)
      } catch (err) {
        console.error('Autocomplete error:', err)
      }
    },
    [isLoaded]
  )

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      const placePrediction = suggestion.placePrediction
      if (!placePrediction) return

      setIsSearching(true)
      setSuggestions([])
      setQuery(placePrediction.text.text)

      try {
        const place = placePrediction.toPlace()
        await place.fetchFields({
          fields: ['addressComponents', 'formattedAddress', 'location'],
        })

        const lat = place.location?.lat()
        const lng = place.location?.lng()

        if (lat == null || lng == null) {
          setError('Failed to get address coordinates. Please try again.')
          setIsSearching(false)
          return
        }

        const distance = calculateDistance(
          env.STORE_LATITUDE,
          env.STORE_LONGITUDE,
          lat,
          lng
        )

        const isOutside = distance > deliveryRadiusKm

        if (isOutside) {
          setError(
            `Delivery is not available to this location. We only deliver within ${deliveryRadiusKm}km from our store.`
          )
          setIsSearching(false)
          return
        }

        setFormData((prev) => ({
          ...prev,
          address_line1:
            getAddressComponent(place.addressComponents, 'street_number') +
            ' ' +
            getAddressComponent(place.addressComponents, 'route'),
          city:
            getAddressComponent(place.addressComponents, 'locality') ||
            getAddressComponent(place.addressComponents, 'sublocality'),
          state: getAddressComponent(
            place.addressComponents,
            'administrative_area_level_1'
          ),
          postal_code: getAddressComponent(
            place.addressComponents,
            'postal_code'
          ),
          latitude: lat,
          longitude: lng,
        }))

        setError(null)
      } catch (err) {
        setError('Failed to get address details. Please try again.')
        console.error('Place details error:', err)
      } finally {
        setIsSearching(false)
      }
    },
    [deliveryRadiusKm]
  )

  const validate = (): boolean => {
    const errors: Record<string, string> = {}
    if (!formData.full_name.trim()) errors.full_name = 'Full name is required'
    if (!formData.phone.trim()) errors.phone = 'Phone number is required'
    if (!formData.address_line1.trim()) errors.address_line1 = 'Street address is required'
    if (!formData.city.trim()) errors.city = 'City is required'
    if (!formData.state) errors.state = 'State is required'
    if (!formData.postal_code.trim()) errors.postal_code = 'Postal code is required'
    
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

    setIsLoading(true)
    setDeliveryAddress(formData)

    console.log('[DeliveryAddressInput] handleSave:', {
      hasLat: !!formData.latitude,
      hasLng: !!formData.longitude,
      lat: formData.latitude,
      lng: formData.longitude,
    })

    // Fetch delivery quote if we have coordinates
    if (formData.latitude && formData.longitude) {
      try {
        console.log('[DeliveryAddressInput] Fetching quote...')
        const res = await fetch('/api/shipping/lalamove/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: crypto.randomUUID(), // temporary ID for quote
            pickup: {
              latitude: env.STORE_LATITUDE,
              longitude: env.STORE_LONGITUDE,
              address: env.STORE_ADDRESS,
            },
            dropoff: {
              latitude: formData.latitude,
              longitude: formData.longitude,
              address: [
                formData.address_line1,
                formData.address_line2,
                formData.city,
                formData.state,
                formData.postal_code,
              ].filter(Boolean).join(', '),
            },
          }),
        })

        const data = await res.json()
        console.log('[DeliveryAddressInput] Quote response:', data)

        if (data.success) {
          setError(null)
          setShippingQuote({
            quotation_id: data.quotationId,
            service_type: data.serviceType,
            stop_ids: data.stopIds,
            quote_expires_at: data.expiresAt,
            price_breakdown: data.priceBreakdown,
            fee_cents: data.feeCents,
          })

          onQuoteFetched?.({
            quotation_id: data.quotationId,
            service_type: data.serviceType,
            fee_cents: data.feeCents,
            expires_at: data.expiresAt,
          })
        } else {
          const errorMsg = data.error || 'Could not calculate delivery fee. You can still proceed with your order.'
          setError(errorMsg)
          onQuoteError?.(errorMsg)
        }
      } catch (err) {
        console.error('Quote fetch error:', err)
        const errorMsg = 'Could not calculate delivery fee. You can still proceed with your order.'
        setError(errorMsg)
        onQuoteError?.(errorMsg)
      }
    } else {
      // Fallback: geocode the address using Nominatim (OpenStreetMap)
      // This handles cases where Google Maps autocomplete was blocked by ad blockers
      console.log('[DeliveryAddressInput] No coordinates, attempting geocoding fallback...')
      try {
        const addressString = [
          formData.address_line1,
          formData.address_line2,
          formData.city,
          formData.state,
          formData.postal_code,
          'Malaysia',
        ].filter(Boolean).join(', ')

        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({ format: 'json', q: addressString, limit: '1', countrycodes: 'my' }),
          { headers: { 'User-Agent': 'MadKrapow/1.0' } }
        )
        const geoData = await geoRes.json()

        if (geoData.length > 0) {
          const lat = parseFloat(geoData[0].lat)
          const lng = parseFloat(geoData[0].lon)
          console.log('[DeliveryAddressInput] Geocoded to:', lat, lng)

          // Update form data with coordinates
          const updatedFormData = { ...formData, latitude: lat, longitude: lng }
          setDeliveryAddress(updatedFormData)

          // Check delivery radius
          const distance = calculateDistance(env.STORE_LATITUDE, env.STORE_LONGITUDE, lat, lng)
          if (distance > deliveryRadiusKm) {
            setError(`Delivery is not available to this location. We only deliver within ${deliveryRadiusKm}km from our store.`)
            onQuoteError?.('Out of delivery range')
            onAddressSelect?.(updatedFormData)
            setIsLoading(false)
            return
          }

          // Fetch delivery quote with geocoded coordinates
          const res = await fetch('/api/shipping/lalamove/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: crypto.randomUUID(),
              pickup: {
                latitude: env.STORE_LATITUDE,
                longitude: env.STORE_LONGITUDE,
                address: env.STORE_ADDRESS,
              },
              dropoff: {
                latitude: lat,
                longitude: lng,
                address: addressString,
              },
            }),
          })

          const data = await res.json()
          console.log('[DeliveryAddressInput] Quote after geocoding:', data)

          if (data.success) {
            setError(null)
            setShippingQuote({
              quotation_id: data.quotationId,
              service_type: data.serviceType,
              stop_ids: data.stopIds,
              quote_expires_at: data.expiresAt,
              price_breakdown: data.priceBreakdown,
              fee_cents: data.feeCents,
            })
          } else {
            setError(data.error || 'Could not calculate delivery fee.')
            onQuoteError?.(data.error)
          }

          onAddressSelect?.(updatedFormData)
          setIsLoading(false)
          return
        } else {
          console.warn('[DeliveryAddressInput] Geocoding returned no results')
          setError('Could not locate this address. Please try selecting from the search results.')
          onQuoteError?.('Address not found')
        }
      } catch (geoErr) {
        console.error('[DeliveryAddressInput] Geocoding failed:', geoErr)
        setError('Could not calculate delivery fee. You can still proceed with your order.')
        onQuoteError?.('Geocoding failed')
      }
    }

    onAddressSelect?.(formData)
    setIsLoading(false)
  }

  const updateField = (field: keyof DeliveryAddress, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (formErrors[field]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Full Name *</label>
          <Input
            placeholder="John Doe"
            value={formData.full_name}
            onChange={(e) => updateField('full_name', e.target.value)}
            className={cn('min-h-11', formErrors.full_name && 'border-destructive')}
            aria-invalid={!!formErrors.full_name}
            aria-describedby={formErrors.full_name ? 'full_name-error' : undefined}
          />
          {formErrors.full_name && <p id="full_name-error" className="text-red-400 text-sm mt-1">{formErrors.full_name}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Phone Number *</label>
          <Input
            placeholder="0123456789"
            value={formData.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            className={cn('min-h-11', formErrors.phone && 'border-destructive')}
            aria-invalid={!!formErrors.phone}
            aria-describedby={formErrors.phone ? 'phone-error' : undefined}
          />
          {formErrors.phone && <p id="phone-error" className="text-red-400 text-sm mt-1">{formErrors.phone}</p>}
        </div>
      </div>

      <div className="space-y-2" ref={wrapperRef}>
        <label className="text-sm font-medium">Search Address</label>
        <div className="relative">
          <Input
            placeholder={loadError ? "Search unavailable — fill fields below instead" : "Search for your building or street"}
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 min-h-11"
            disabled={!!loadError}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {suggestions.length > 0 && (
          <ul className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.placePrediction?.placeId}
                className="px-3 py-2 cursor-pointer hover:bg-muted text-sm"
                onClick={() => handleSelectSuggestion(suggestion)}
              >
                {suggestion.placePrediction?.text.text}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        {loadError && (
          <p className="text-xs text-amber-600 mt-1">
            Address search unavailable — fill in the fields below and we&apos;ll locate your address automatically.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Street Address *</label>
          <Input
            placeholder="Unit No, Building, Street Name"
            value={formData.address_line1}
            onChange={(e) => updateField('address_line1', e.target.value)}
            className={cn('min-h-11', formErrors.address_line1 && 'border-destructive')}
            aria-invalid={!!formErrors.address_line1}
            aria-describedby={formErrors.address_line1 ? 'address_line1-error' : undefined}
          />
          {formErrors.address_line1 && <p id="address_line1-error" className="text-red-400 text-sm mt-1">{formErrors.address_line1}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Additional Info (Optional)</label>
          <Input
            placeholder="Apartment, suite, unit, etc."
            value={formData.address_line2}
            onChange={(e) => updateField('address_line2', e.target.value)}
            className="min-h-11"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">City *</label>
            <Input
              placeholder="City"
              value={formData.city}
              onChange={(e) => updateField('city', e.target.value)}
              className={cn('min-h-11', formErrors.city && 'border-destructive')}
              aria-invalid={!!formErrors.city}
              aria-describedby={formErrors.city ? 'city-error' : undefined}
            />
            {formErrors.city && <p id="city-error" className="text-red-400 text-sm mt-1">{formErrors.city}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Postal Code *</label>
            <Input
              placeholder="Postal Code"
              value={formData.postal_code}
              onChange={(e) => updateField('postal_code', e.target.value)}
              className={cn('min-h-11', formErrors.postal_code && 'border-destructive')}
              aria-invalid={!!formErrors.postal_code}
              aria-describedby={formErrors.postal_code ? 'postal_code-error' : undefined}
            />
            {formErrors.postal_code && <p id="postal_code-error" className="text-red-400 text-sm mt-1">{formErrors.postal_code}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">State *</label>
          <select
            value={formData.state}
            onChange={(e) => updateField('state', e.target.value)}
            className={cn(
              "flex min-h-11 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 pr-8 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 appearance-none",
              formErrors.state ? 'border-destructive' : ''
            )}
            aria-invalid={!!formErrors.state}
            aria-describedby={formErrors.state ? 'state-error' : undefined}
          >
            <option value="" disabled>Select state</option>
            {MALAYSIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          {formErrors.state && <p id="state-error" className="text-red-400 text-sm mt-1">{formErrors.state}</p>}
        </div>
      </div>

      <Button className="w-full" onClick={handleSave} disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Check className="mr-2 h-4 w-4" />
            Confirm Address
          </>
        )}
      </Button>
    </div>
  )
}
