'use client'

import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info, Tag } from 'lucide-react'
import { useToastStore, type ToastType } from '@/stores/toast'
import { cn } from '@/lib/utils'

const toastStyles: Record<ToastType, string> = {
  success: 'border-green-500/30 bg-green-500/10 text-green-400',
  error: 'border-red-500/30 bg-red-500/10 text-red-400',
  info: 'border-primary/30 bg-primary/10 text-primary',
  promo: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
}

const toastIcons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-green-400" />,
  error: <AlertCircle className="h-4 w-4 text-red-400" />,
  info: <Info className="h-4 w-4 text-primary" />,
  promo: <Tag className="h-4 w-4 text-amber-400" />,
}

interface ToastItemProps {
  id: string
  type: ToastType
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function ToastItem({ id, type, title, description, action }: ToastItemProps) {
  const removeToast = useToastStore((state) => state.removeToast)

  useEffect(() => {
    return () => removeToast(id)
  }, [id, removeToast])

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg shadow-black/20 backdrop-blur-sm animate-fade-in-up',
        toastStyles[type]
      )}
      role="alert"
    >
      <div className="mt-0.5 shrink-0">{toastIcons[type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        {action && (
          <button
            onClick={() => {
              action.onClick()
              removeToast(id)
            }}
            className="mt-2 text-xs font-medium underline underline-offset-2 hover:opacity-80"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
