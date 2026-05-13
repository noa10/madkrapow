'use client'

import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DriverInfo } from '@/components/order/DriverInfo'
import { useToastStore } from '@/stores/toast'

interface AdminDriverTrackingCardProps {
  orderId: string
  driver_name?: string | null
  driver_phone?: string | null
  driver_plate_number?: string | null
  driver_photo_url?: string | null
  driver_location_updated_at?: string | null
  canRefresh: boolean
  onRefreshSuccess?: (driver: {
    name: string
    phone: string
    plateNumber: string
    photo?: string
    coordinates?: { lat: string; lng: string; updatedAt: string }
  }) => void
}

export function AdminDriverTrackingCard({
  orderId,
  driver_name,
  driver_phone,
  driver_plate_number,
  driver_photo_url,
  driver_location_updated_at,
  canRefresh,
  onRefreshSuccess,
}: AdminDriverTrackingCardProps) {
  const [refreshing, setRefreshing] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/shipping/lalamove/orders/${orderId}/driver`, {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = body?.code as string | undefined
        const message =
          code === 'DRIVER_DETAILS_UNAVAILABLE'
            ? 'Driver details are not available yet (driver not assigned or order completed).'
            : code === 'NO_DRIVER'
              ? 'No driver has been assigned to this order yet.'
              : body?.error || 'Failed to refresh driver location.'
        addToast({ type: 'error', title: 'Driver refresh failed', description: message })
        return
      }
      addToast({
        type: 'success',
        title: 'Driver location refreshed',
        description: body?.driver?.name ? `Latest location pulled for ${body.driver.name}.` : undefined,
      })
      if (body?.driver && onRefreshSuccess) {
        onRefreshSuccess(body.driver)
      }
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Driver refresh failed',
        description: err instanceof Error ? err.message : 'Network error.',
      })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-2">
      <DriverInfo
        driver_name={driver_name}
        driver_phone={driver_phone}
        driver_plate_number={driver_plate_number}
        driver_photo_url={driver_photo_url}
        driver_location_updated_at={driver_location_updated_at}
      />
      {canRefresh && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {refreshing ? 'Refreshing…' : 'Refresh driver location'}
          </Button>
        </div>
      )}
    </div>
  )
}

