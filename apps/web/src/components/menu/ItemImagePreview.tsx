'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { cn } from '@/lib/utils'

interface ItemImagePreviewProps {
  imageUrl: string | null
  itemName: string
  /**
   * `default` — framed preview for the item detail page (contain, letterboxed).
   * `banner` — full-bleed edge-to-edge cover image for modal headers
   * (no frame, no "Click to zoom" chip). Still opens the zoom lightbox.
   */
  variant?: 'default' | 'banner'
}

function PlaceholderImage() {
  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center rounded-3xl border border-border bg-surface-2">
      <span className="text-muted-foreground">No image</span>
    </div>
  )
}

export function ItemImagePreview({ imageUrl, itemName, variant = 'default' }: ItemImagePreviewProps) {
  const isBanner = variant === 'banner'
  const [isOpen, setIsOpen] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  useBodyScrollLock(isOpen)

  const openModal = () => {
    setIsZoomed(false)
    setIsOpen(true)
  }

  const onPanelPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isZoomed || event.pointerType !== 'mouse') return
    const container = scrollRef.current
    if (!container) return
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: container.scrollLeft,
      top: container.scrollTop,
    }
    setIsDragging(true)
    container.setPointerCapture(event.pointerId)
  }

  const onPanelPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = scrollRef.current
    const drag = dragRef.current
    if (!container || !drag) return
    container.scrollLeft = drag.left - (event.clientX - drag.x)
    container.scrollTop = drag.top - (event.clientY - drag.y)
  }

  const onPanelPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = scrollRef.current
    dragRef.current = null
    setIsDragging(false)
    if (container?.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId)
    }
  }

  if (!imageUrl) {
    return isBanner ? (
      <div className="relative flex aspect-[3/2] w-full items-center justify-center bg-surface-2">
        <span className="text-sm text-muted-foreground">No image</span>
      </div>
    ) : (
      <PlaceholderImage />
    )
  }

  // Portaled to <body>: the preview lives inside a `lg:sticky` aside, and
  // sticky establishes a stacking context — an in-place overlay would be
  // trapped there and painted underneath sibling content (the customize
  // panel), no matter how high its z-index is.
  const modal = (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onClick={() => setIsOpen(false)}
      data-testid="item-image-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`${itemName} image zoom dialog`}
    >
      <div
        className="relative w-full max-w-4xl rounded-3xl border border-border bg-surface p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {isZoomed ? 'Drag to pan' : 'Inspect menu image'}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-border-2 px-3.5 py-1.5 text-sm font-semibold hover:bg-surface-2"
              onClick={() => setIsZoomed((prev) => !prev)}
              data-testid="item-image-zoom-toggle"
            >
              {isZoomed ? 'Zoom out' : 'Zoom in'}
            </button>
            <button
              type="button"
              className="rounded-full border border-border-2 px-3.5 py-1.5 text-sm font-semibold hover:bg-surface-2"
              onClick={() => setIsOpen(false)}
              aria-label="Close image zoom dialog"
            >
              Close
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          onPointerDown={onPanelPointerDown}
          onPointerMove={onPanelPointerMove}
          onPointerUp={onPanelPointerUp}
          onPointerCancel={onPanelPointerUp}
          className={cn(
            'relative w-full rounded-2xl border border-border bg-surface-sunk',
            isZoomed
              ? cn('h-[72vh] cursor-grab overflow-auto', isDragging && 'cursor-grabbing select-none')
              : 'aspect-[4/3] overflow-hidden'
          )}
        >
          {isZoomed ? (
            <div className="relative aspect-[4/3] w-[200%] max-w-none">
              <Image
                src={imageUrl}
                alt={itemName}
                fill
                draggable={false}
                className="object-contain"
                sizes="2048px"
                data-testid="item-image-modal-image"
              />
            </div>
          ) : (
            <Image
              src={imageUrl}
              alt={itemName}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 1024px"
              data-testid="item-image-modal-image"
            />
          )}
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={cn(
          'group relative block w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          !isBanner && 'rounded-3xl border border-border bg-surface-sunk'
        )}
        aria-label={`Open ${itemName} image in zoom view`}
        data-testid="item-image-preview-button"
      >
        <div
          className={cn(
            'relative w-full',
            isBanner ? 'aspect-[3/2]' : 'mx-auto aspect-[4/3] max-w-[420px]'
          )}
        >
          <Image
            src={imageUrl}
            alt={itemName}
            fill
            className={cn(
              'transition-transform duration-300 group-hover:scale-[1.02]',
              isBanner ? 'object-cover' : 'object-contain'
            )}
            sizes={isBanner ? '(max-width: 640px) 100vw, 640px' : '(max-width: 1024px) 100vw, 360px'}
            priority
          />
        </div>
        {!isBanner && (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-surface-sunk/85 px-3 py-1 text-xs font-semibold text-sesame backdrop-blur">
            Click to zoom
          </span>
        )}
      </button>

      {isOpen && createPortal(modal, document.body)}
    </>
  )
}
