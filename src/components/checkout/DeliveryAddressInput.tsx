'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { useCheckoutStore, type DeliveryAddress } from '@/stores/checkout'
import { env } from '@/lib/validators/env'

declare global {
  interface Window {
    google: typeof google
    initGooglePlaces: () => void
  }
}

interface DeliveryAddressInputProps {
  onAddressSelect?: (address: DeliveryAddress) => void
  deliveryRadiusKm?: number
}

interface PlaceDetails {
  address_components: Array<{
    types: string[]
    long_name: string
    short_name: string
  }>
  formatted_address: string
  geometry: {
    location: {
      lat: () => number
      lng: () => number
    }
  }
}

function getAddressComponent(components: PlaceDetails['address_components'], type: string): string {
  const component = components.find(c => c.types.includes(type))
  return component?.long_name || ''
}

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
  deliveryRadiusKm = 10
}: DeliveryAddressInputProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null)
  const [isOutsideDeliveryZone, setIsOutsideDeliveryZone] = useState(false)
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesService = useRef<google.maps.places.PlacesService | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { setDeliveryAddress } = useCheckoutStore()

  useEffect(() => {
    if (!window.google) {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places&callback=initGooglePlaces`
      script.async = true
      script.defer = true
      window.initGooglePlaces = () => {
        autocompleteService.current = new google.maps.places.AutocompleteService()
        const mapDiv = document.createElement('div')
        placesService.current = new google.maps.places.PlacesService(mapDiv)
      }
      document.head.appendChild(script)
    } else if (!autocompleteService.current) {
      autocompleteService.current = new google.maps.places.AutocompleteService()
      const mapDiv = document.createElement('div')
      placesService.current = new google.maps.places.PlacesService(mapDiv)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setSuggestions([])
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleInputChange = useCallback(async (value: string) => {
    setQuery(value)
    setError(null)
    setIsOutsideDeliveryZone(false)

    if (!value.trim() || !autocompleteService.current) {
      setSuggestions([])
      return
    }

    try {
      const response = await autocompleteService.current.getPlacePredictions({
        input: value,
        componentRestrictions: { country: 'my' },
        types: ['address'],
      })
      setSuggestions(response?.predictions || [])
    } catch (err) {
      console.error('Autocomplete error:', err)
    }
  }, [])

  const handleSelectSuggestion = useCallback(async (prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesService.current) return

    setIsLoading(true)
    setSuggestions([])
    setQuery(prediction.description)

    try {
      const details = await new Promise<PlaceDetails>((resolve, reject) => {
        placesService.current?.getDetails(
          {
            placeId: prediction.place_id,
            fields: ['address_components', 'formatted_address', 'geometry'],
          },
          (place, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && place) {
              resolve(place as PlaceDetails)
            } else {
              reject(new Error('Failed to get place details'))
            }
          }
        )
      })

      const lat = details.geometry.location.lat()
      const lng = details.geometry.location.lng()

      const distance = calculateDistance(
        env.STORE_LATITUDE,
        env.STORE_LONGITUDE,
        lat,
        lng
      )

      const isOutside = distance > deliveryRadiusKm
      setIsOutsideDeliveryZone(isOutside)

      if (isOutside) {
        setError(`Delivery is not available to this location. We only deliver within ${deliveryRadiusKm}km from our store.`)
        setIsLoading(false)
        return
      }

      const address: DeliveryAddress = {
        full_name: '',
        phone: '',
        address_line1: getAddressComponent(details.address_components, 'street_number') + ' ' +
          getAddressComponent(details.address_components, 'route'),
        address_line2: '',
        city: getAddressComponent(details.address_components, 'locality') ||
          getAddressComponent(details.address_components, 'sublocality'),
        state: getAddressComponent(details.address_components, 'administrative_area_level_1'),
        postal_code: getAddressComponent(details.address_components, 'postal_code'),
        country: getAddressComponent(details.address_components, 'country'),
        latitude: lat,
        longitude: lng,
      }

      setSelectedPlace(details)
      setDeliveryAddress(address)
      onAddressSelect?.(address)
      setError(null)
    } catch (err) {
      setError('Failed to get address details. Please try again.')
      console.error('Place details error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [deliveryRadiusKm, setDeliveryAddress, onAddressSelect])

  const mapEmbedUrl = selectedPlace?.geometry?.location
    ? `https://www.google.com/maps/embed/v1/place?key=${env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&q=${selectedPlace.geometry.location.lat()},${selectedPlace.geometry.location.lng()}`
    : null

  return (
    <div className="space-y-4">
      <div ref={wrapperRef} className="relative">
        <Input
          ref={inputRef}
          type="text"
          placeholder="Enter your delivery address"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          disabled={isLoading}
          className="w-full"
        />

        {suggestions.length > 0 && (
          <ul className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.place_id}
                className="px-3 py-2 cursor-pointer hover:bg-muted"
                onClick={() => handleSelectSuggestion(suggestion)}
              >
                {suggestion.description}
              </li>
            ))}
          </ul>
        )}

        {isLoading && (
          <p className="text-sm text-muted-foreground mt-1">Loading address details...</p>
        )}

        {error && (
          <p className="text-sm text-destructive mt-1">{error}</p>
        )}
      </div>

      {selectedPlace && !isOutsideDeliveryZone && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Delivery Location</p>
          <div className="relative h-48 w-full rounded-lg overflow-hidden border">
            {mapEmbedUrl && (
              <iframe
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={mapEmbedUrl}
                title="Delivery location map"
              />
            )}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedPlace.formatted_address}
          </p>
        </div>
      )}
    </div>
  )
}
