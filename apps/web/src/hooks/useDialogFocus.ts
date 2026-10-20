'use client'

import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  )
}

/**
 * Overlays register their panels here in mount order. Only the topmost panel
 * may trap Tab: nested dialogs (the image lightbox rendered on top of the
 * quick view) each add their own document-level handler, and without this
 * guard the outer handler would see focus outside its panel, prevent the
 * default Tab and pull focus back to its own first control every time.
 */
const focusTrapStack: HTMLElement[] = []

/**
 * Focus management for a modal panel: focuses it on open, keeps Tab inside it
 * and restores focus to whatever was focused before it opened. Esc is handled
 * by the calling overlay so stacked overlays stay in control of their turn.
 */
export function useDialogFocus<T extends HTMLElement>(
  panelRef: RefObject<T | null>,
  active = true
) {
  useEffect(() => {
    if (!active) return

    const panel = panelRef.current
    if (!panel) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    panel.focus()
    focusTrapStack.push(panel)

    const isTopmost = () => focusTrapStack[focusTrapStack.length - 1] === panel

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !isTopmost()) return

      const focusable = getFocusable(panel)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement

      if (event.shiftKey) {
        if (current === first || current === panel || !panel.contains(current)) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (current === last || current === panel || !panel.contains(current)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const index = focusTrapStack.lastIndexOf(panel)
      if (index !== -1) focusTrapStack.splice(index, 1)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [active, panelRef])
}
