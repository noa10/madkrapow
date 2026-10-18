"use client"

import { useEffect } from "react"
import { resetNavigationSteps, useInAppHistory } from "@/lib/navigation/back"

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

  useEffect(() => {
    // This component only mounts as part of a full document load (initial
    // visit, external link, typed URL, hard reload). That is an entry point,
    // not in-app navigation, so start a fresh count — otherwise a tab that
    // navigated earlier could let Back leave the app from a deep link.
    resetNavigationSteps()
  }, [])

  return null
}
