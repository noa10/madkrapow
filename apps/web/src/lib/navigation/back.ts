'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const NAV_STEPS_KEY = 'mkp:nav-steps'

/**
 * Returns the tab's sessionStorage, or null when it is unavailable
 * (SSR, private-mode restrictions, or a blocked storage API).
 */
function getSessionStorage(): Storage | null {
  try {
    if (typeof globalThis.sessionStorage !== 'undefined') {
      return globalThis.sessionStorage
    }
  } catch {
    return null
  }

  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Whether the tab has enough in-app history to safely call `router.back()`. */
export function shouldGoBack(steps: number): boolean {
  return steps > 0
}

/** Read how many in-app navigations the current tab has recorded. */
export function getNavigationSteps(): number {
  const storage = getSessionStorage()
  if (!storage) return 0

  try {
    const steps = Number(storage.getItem(NAV_STEPS_KEY))
    return Number.isInteger(steps) && steps > 0 ? steps : 0
  } catch {
    return 0
  }
}

/** Record one in-app navigation and return the new total for this tab. */
export function recordNavigation(): number {
  const storage = getSessionStorage()
  if (!storage) return 0

  const steps = getNavigationSteps() + 1
  try {
    storage.setItem(NAV_STEPS_KEY, String(steps))
    return steps
  } catch {
    return 0
  }
}

/**
 * Track in-app history for as long as the calling component is mounted.
 *
 * The initial pathname is the tab's entry point and is deliberately not
 * counted: a fresh tab that deep-links into the app must fall back instead of
 * calling `router.back()` out of the app. Only subsequent pathname changes are
 * in-app navigations.
 */
export function useInAppHistory(): void {
  const pathname = usePathname()
  const previousPathname = useRef(pathname)

  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    recordNavigation()
  }, [pathname])
}
