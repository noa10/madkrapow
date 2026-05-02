import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'promo'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  duration?: number
  action?: { label: string; onClick: () => void }
}

type ToastState = {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

let idCounter = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++idCounter}-${Date.now()}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    if (toast.duration !== 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
      }, toast.duration ?? 4000)
    }
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
