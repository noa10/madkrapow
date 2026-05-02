'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCheckoutStore } from '@/stores/checkout'

interface OperatingHours {
  open: string
  close: string
}

type OperatingHoursMap = Record<string, OperatingHours>

interface TimeSlotPickerProps {
  operatingHours: OperatingHoursMap | null
  deliveryType: 'delivery' | 'self_pickup'
  kitchenLeadMinutes: number
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM'
  const displayHour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${displayHour}:00 ${period}`
}

function generateTimeSlots(
  operatingHours: OperatingHours | null,
  selectedDate: Date,
  deliveryType: 'delivery' | 'self_pickup',
  kitchenLeadMinutes: number
): Array<{ start: string; end: string; label: string }> {
  if (!operatingHours) return []

  const slots: Array<{ start: string; end: string; label: string }> = []
  const now = new Date()
  const minTime = new Date(now.getTime() + kitchenLeadMinutes * 60 * 1000)

  const [openH] = operatingHours.open.split(':').map(Number)
  const [closeH] = operatingHours.close.split(':').map(Number)

  for (let h = openH; h < closeH; h++) {
    const slotStart = new Date(selectedDate)
    slotStart.setHours(h, 0, 0, 0)

    const slotEnd = new Date(selectedDate)
    slotEnd.setHours(h + 1, 0, 0, 0)

    if (slotStart < minTime) continue

    slots.push({
      start: slotStart.toISOString(),
      end: slotEnd.toISOString(),
      label: `${formatHour(h)} - ${formatHour(h + 1)}`,
    })
  }

  return slots
}

function getAvailableDates(operatingHours: OperatingHoursMap | null): Date[] {
  const dates: Date[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() + i)
    const dayName = DAY_NAMES[date.getDay()]

    if (operatingHours?.[dayName]) {
      dates.push(date)
    }
  }

  return dates
}

function formatDateShort(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (date.getTime() === today.getTime()) return 'Today'
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow'

  return date.toLocaleDateString('en-MY', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function TimeSlotPicker({
  operatingHours,
  deliveryType,
  kitchenLeadMinutes,
}: TimeSlotPickerProps) {
  const scheduledWindow = useCheckoutStore((state) => state.scheduled_window)
  const setScheduledWindow = useCheckoutStore((state) => state.setScheduledWindow)

  const availableDates = useMemo(
    () => getAvailableDates(operatingHours),
    [operatingHours]
  )

  const [selectedDateIndex, setSelectedDateIndex] = useState(0)
  const selectedDate = availableDates[selectedDateIndex] ?? availableDates[0]

  const timeSlots = useMemo(() => {
    if (!selectedDate || !operatingHours) return []
    const dayName = DAY_NAMES[selectedDate.getDay()]
    const dayHours = operatingHours[dayName] ?? null
    return generateTimeSlots(dayHours, selectedDate, deliveryType, kitchenLeadMinutes)
  }, [selectedDate, operatingHours, deliveryType, kitchenLeadMinutes])

  const handleSlotSelect = (slot: { start: string; end: string; label: string }) => {
    setScheduledWindow({
      date: selectedDate.toISOString().split('T')[0],
      window_start: slot.start,
      window_end: slot.end,
      label: slot.label,
    })
  }

  const isSelected = (slotStart: string) => {
    return scheduledWindow?.window_start === slotStart
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedDateIndex(Math.max(0, selectedDateIndex - 1))}
          disabled={selectedDateIndex === 0}
          className="h-11 w-11"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">
          {selectedDate ? formatDateShort(selectedDate) : 'Select date'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setSelectedDateIndex(
              Math.min(availableDates.length - 1, selectedDateIndex + 1)
            )
          }
          disabled={selectedDateIndex >= availableDates.length - 1}
          className="h-11 w-11"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {availableDates.map((date, index) => (
          <button
            key={date.toISOString()}
            onClick={() => setSelectedDateIndex(index)}
            className={cn(
              'flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] active:scale-[0.98]',
              index === selectedDateIndex
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {formatDateShort(date)}
          </button>
        ))}
      </div>

      {timeSlots.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No available time slots for this date.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {timeSlots.map((slot) => (
            <button
              key={slot.start}
              onClick={() => handleSlotSelect(slot)}
              className={cn(
                'px-3 py-3 rounded-lg text-sm font-medium transition-all border min-h-[44px] active:scale-[0.98]',
                isSelected(slot.start)
                  ? 'bg-primary text-primary-foreground border-primary shadow-gold'
                  : 'bg-background text-foreground border-border hover:border-primary'
              )}
            >
              {slot.label}
            </button>
          ))}
        </div>
      )}

      {scheduledWindow && (
        <p className="text-sm text-muted-foreground">
          Selected: {formatDateShort(selectedDate)} at {scheduledWindow.label}
        </p>
      )}
    </div>
  )
}
