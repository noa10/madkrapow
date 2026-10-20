'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * True only after hydration. Use it to gate values sourced from localStorage
 * (the persisted cart) so the server HTML and the first client render agree;
 * `useEffect`+`setState` would trip the react-hooks/set-state-in-effect rule.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )
}
