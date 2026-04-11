'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

interface ItemImagePreviewProps {
  imageUrl: string | null
  itemName: string
}

function PlaceholderImage() {
  return (
    <div className="relative w-full aspect-square bg-muted flex items-center justify-center rounded-2xl border">
      <span className="text-muted-foreground">No image</span>
    </div>
  )
}

export function ItemImagePreview({ imageUrl, itemName }: ItemImagePreviewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)

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

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!imageUrl) {
    return <PlaceholderImage />
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group relative block w-full overflow-hidden rounded-2xl border bg-card shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Open ${itemName} image in zoom view`}
        data-testid="item-image-preview-button"
      >
        <div className="relative mx-auto aspect-square w-full max-w-[360px]">
          <Image
            src={imageUrl}
            alt={itemName}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 1024px) 100vw, 360px"
            priority
          />
        </div>
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-background/90 px-3 py-1 text-xs font-medium text-foreground shadow">
          Click to zoom
        </span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setIsOpen(false)}
          data-testid="item-image-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${itemName} image zoom dialog`}
        >
          <div
            className="relative w-full max-w-4xl rounded-2xl bg-background p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Inspect menu image</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  onClick={() => setIsZoomed((prev) => !prev)}
                  data-testid="item-image-zoom-toggle"
                >
                  {isZoomed ? 'Zoom out' : 'Zoom in'}
                </button>
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close image zoom dialog"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-muted/20">
              <Image
                src={imageUrl}
                alt={itemName}
                fill
                className={isZoomed ? 'object-cover' : 'object-contain'}
                sizes="(max-width: 1024px) 100vw, 1024px"
                data-testid="item-image-modal-image"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
