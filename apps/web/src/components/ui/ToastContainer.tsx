'use client'

import { useToastStore } from '@/stores/toast'
import { ToastItem } from './Toast'

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-3 sm:bottom-6 sm:right-6"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} />
      ))}
    </div>
  )
}
