import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns"
import type { DateFilterValue, CustomDateRange } from "@/stores/adminOrdersStore"
import type { DateRange } from "@/types/orders"

export function toDateRange(filter: DateFilterValue, customRange: CustomDateRange): DateRange | null {
  const now = new Date()
  switch (filter) {
    case "today":
      return {
        start: startOfDay(now).toISOString(),
        end: endOfDay(now).toISOString(),
      }
    case "weekly":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
        end: endOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      }
    case "monthly":
      return {
        start: startOfMonth(now).toISOString(),
        end: endOfMonth(now).toISOString(),
      }
    case "custom":
      if (customRange.start && customRange.end) {
        return {
          start: startOfDay(parseISO(customRange.start)).toISOString(),
          end: endOfDay(parseISO(customRange.end)).toISOString(),
        }
      }
      return null
    default:
      return null
  }
}
