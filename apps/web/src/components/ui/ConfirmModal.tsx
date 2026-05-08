"use client"

import { useState, useEffect, useRef, useCallback, type FormEvent } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { InlineSpinner } from "./InlineSpinner"

interface ConfirmModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "danger" | "warning" | "default"
  loading?: boolean
  requireNote?: boolean
  noteMinLength?: number
  notePlaceholder?: string
  onConfirm: (note?: string) => void
}

export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  loading = false,
  requireNote = false,
  noteMinLength = 0,
  notePlaceholder = "Enter a reason...",
  onConfirm,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const [note, setNote] = useState("")
  const noteValid = !requireNote || note.length >= noteMinLength

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      if (!noteValid || loading) return
      onConfirm(requireNote ? note : undefined)
    },
    [noteValid, loading, onConfirm, requireNote, note]
  )

  const confirmBtnClass = cn(
    "rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 flex items-center gap-2",
    variant === "danger" &&
      "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25",
    variant === "warning" &&
      "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25",
    variant === "default" &&
      "bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25",
    (loading || !noteValid) && "opacity-50 cursor-not-allowed"
  )

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className={cn(
        "backdrop:bg-black/60 backdrop:backdrop-blur-sm",
        "bg-transparent border-none p-0 m-auto",
        "max-w-md w-[calc(100%-2rem)]",
        "open:animate-fade-in-up"
      )}
    >
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-white/10 bg-card p-6 shadow-2xl shadow-black/40"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Description */}
        {description && (
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
        )}

        {/* Note textarea */}
        {requireNote && (
          <div className="mb-4">
            <textarea
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={notePlaceholder}
              rows={3}
              className={cn(
                "w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-foreground",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-1 focus:ring-gold/40 focus:border-gold/30",
                "transition-all resize-none",
                note.length > 0 && note.length < noteMinLength
                  ? "border-red-500/40"
                  : "border-white/10"
              )}
              disabled={loading}
            />
            {note.length > 0 && note.length < noteMinLength && (
              <p className="mt-1 text-[11px] text-red-400">
                {noteMinLength - note.length} more character{noteMinLength - note.length !== 1 ? "s" : ""} required
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
          >
            {cancelLabel}
          </button>
          <button type="submit" disabled={loading || !noteValid} className={confirmBtnClass}>
            {loading && <InlineSpinner size="sm" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}

