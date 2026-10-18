"use client"

import { useInAppHistory } from "@/lib/navigation/back"

/**
 * Persistent (root-layout) tracker for in-app navigation.
 *
 * Mounting the tracker at the root keeps one instance alive across route
 * changes, so a menu -> item navigation is counted before the item page's
 * BackButton reads the counter. A tracker mounted inside the BackButton only
 * sees pathname changes that happen while that button is already on screen.
 */
export function InAppHistoryTracker() {
  useInAppHistory()
  return null
}
