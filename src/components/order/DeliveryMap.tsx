'use client'

import { useCallback, useState } from 'react'
import { GoogleMap, Marker, DirectionsRenderer } from '@react-google-maps/api'
import { MapPin, Navigation, Loader2 } from 'lucide-react'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'
import { env } from '@/lib/validators/env'

interface DeliveryMapProps {
  driverLatitude: number | null
  driverLongitude: number | null
  deliveryLatitude: number | null
  deliveryLongitude: number | null
  driverName: string | null
  orderStatus: string
  deliveryType: string
}

const containerStyle = {
  width: '100%',
  height: '400px',
}

export function DeliveryMap({
  driverLatitude,
  driverLongitude,
  deliveryLatitude,
  deliveryLongitude,
  driverName,
  orderStatus,
  deliveryType,
}: DeliveryMapProps) {
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  const { isLoaded, loadError } = useGoogleMaps()

  const onMapLoad = useCallback(() => {
    setMapLoaded(true)

    if (driverLatitude && driverLongitude && deliveryLatitude && deliveryLongitude) {
      const directionsService = new google.maps.DirectionsService()
      directionsService.route(
        {
          origin: { lat: driverLatitude, lng: driverLongitude },
          destination: { lat: deliveryLatitude, lng: deliveryLongitude },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === 'OK' && result) {
            setDirections(result)
          }
        }
      )
    }
  }, [driverLatitude, driverLongitude, deliveryLatitude, deliveryLongitude])

  // Hide map for pickup orders
  if (deliveryType === 'self_pickup') {
    return null
  }

  // No driver assigned yet
  if (!driverLatitude || !driverLongitude) {
    if (orderStatus === 'picked_up' || orderStatus === 'delivered') {
      return (
        <section className="rounded-lg border bg-card p-5">
          <h2 className="text-lg font-semibold mb-4 font-display flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Live Tracking
          </h2>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Driver location not available yet</p>
            <p className="text-xs text-muted-foreground mt-1">Location updates will appear here</p>
          </div>
        </section>
      )
    }
    return null
  }

  // Google Maps API key not configured
  if (loadError || !env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) {
    return (
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4 font-display flex items-center gap-2">
          <Navigation className="h-5 w-5 text-primary" />
          Live Tracking
        </h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Map is currently unavailable</p>
          {driverName && (
            <p className="text-xs text-muted-foreground mt-1">
              {driverName} is on the way with your order
            </p>
          )}
        </div>
      </section>
    )
  }

  // Loading state
  if (!isLoaded) {
    return (
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold mb-4 font-display flex items-center gap-2">
          <Navigation className="h-5 w-5 text-primary" />
          Live Tracking
        </h2>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </section>
    )
  }

  const driverPosition = { lat: driverLatitude, lng: driverLongitude }
  const deliveryPosition = deliveryLatitude && deliveryLongitude
    ? { lat: deliveryLatitude, lng: deliveryLongitude }
    : null

  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="text-lg font-semibold mb-4 font-display flex items-center gap-2">
        <Navigation className="h-5 w-5 text-primary" />
        Live Tracking
      </h2>
      <div className="rounded-lg overflow-hidden">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={driverPosition}
          zoom={15}
          onLoad={onMapLoad}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
            styles: [
              { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
              { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
              { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
              { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2d44' }] },
              { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
              { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f0f23' }] },
            ],
          }}
        >
          <Marker
            position={driverPosition}
            title={driverName || 'Driver'}
            icon={{
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%23d4b896" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>'
              ),
              scaledSize: new google.maps.Size(32, 32),
              anchor: new google.maps.Point(16, 16),
            }}
          />
          {deliveryPosition && (
            <Marker
              position={deliveryPosition}
              title="Delivery Location"
              icon={{
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%23d4b896" stroke="%23d4b896" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="%230a0a14"/></svg>'
                ),
                scaledSize: new google.maps.Size(32, 32),
                anchor: new google.maps.Point(16, 32),
              }}
            />
          )}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: '#d4b896',
                  strokeWeight: 4,
                  strokeOpacity: 0.8,
                },
              }}
            />
          )}
        </GoogleMap>
      </div>
      {mapLoaded && (
        <p className="text-xs text-muted-foreground text-center mt-3">
          {driverName ? `${driverName} is on the way` : 'Driver is en route to your location'}
        </p>
      )}
    </section>
  )
}
