import { Phone, Car, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DriverInfoProps {
  driver_name?: string | null
  driver_phone?: string | null
  driver_plate_number?: string | null
  driver_photo_url?: string | null
  driver_location_updated_at?: string | null
}

function getLastUpdatedText(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)

  if (diffSec < 60) return `Last updated: ${diffSec}s ago`
  if (diffMin < 60) return `Last updated: ${diffMin} min ago`
  return `Last updated: ${Math.floor(diffMin / 60)}h ago`
}

export function DriverInfo({
  driver_name,
  driver_phone,
  driver_plate_number,
  driver_photo_url,
  driver_location_updated_at,
}: DriverInfoProps) {
  const hasDriverInfo = driver_name || driver_phone || driver_plate_number

  if (!hasDriverInfo) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            Driver Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Driver not yet assigned</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <User className="h-5 w-5" />
          Driver Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {driver_name && (
          <div className="flex items-center gap-3">
            {driver_photo_url ? (
              <img
                src={driver_photo_url}
                alt="Driver"
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div>
              <span className="text-sm font-medium">{driver_name}</span>
              {driver_location_updated_at && (
                <p className="text-xs text-muted-foreground">
                  {getLastUpdatedText(driver_location_updated_at)}
                </p>
              )}
            </div>
          </div>
        )}

        {driver_phone && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-20">Phone:</span>
            <a 
              href={`tel:${driver_phone}`}
              className="text-sm font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
            >
              <Phone className="h-3 w-3" />
              {driver_phone}
            </a>
          </div>
        )}
        
        {driver_plate_number && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-20">Plate:</span>
            <div className="flex items-center gap-2">
              <Car className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm font-medium bg-muted px-2 py-1 rounded">
                {driver_plate_number}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
