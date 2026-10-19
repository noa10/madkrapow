'use client'

import { useEffect } from 'react'

// Overlays stack (quick-view dialog → image zoom lightbox → cart drawer).
// Each mounted overlay requests the lock; the body only unlocks when the
// last one releases it, so closing an inner overlay never re-enables
// scrolling behind an outer one. Reference counting is module-level because
// overlays mount as independent component trees (portals included).
let lockCount = 0

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return

    lockCount += 1
    document.body.style.overflow = 'hidden'

    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) {
        document.body.style.overflow = ''
      }
    }
  }, [active])
}
