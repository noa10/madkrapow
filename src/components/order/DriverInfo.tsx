import { Phone, Car, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DriverInfoProps {
  driver_name?: string | null
  driver_phone?: string | null
  driver_plate_number?: string | null
}

export function DriverInfo({ driver_name, driver_phone, driver_plate_number }: DriverInfoProps) {
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
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-20">Name:</span>
            <span className="text-sm font-medium">{driver_name}</span>
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
