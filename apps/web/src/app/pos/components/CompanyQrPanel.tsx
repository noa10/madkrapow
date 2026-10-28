'use client'

import Image from 'next/image'

interface CompanyQrPanelProps {
  amountCents: number
  note?: string
}

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

/**
 * The merchant's DuitNow QR poster plus the amount due.
 *
 * The image is a public, receive-only payment QR supplied by the business.
 * Keep it as-is (the full poster includes the merchant name and accepted
 * banks); the white frame preserves the QR quiet zone.
 */
export function CompanyQrPanel({ amountCents, note }: CompanyQrPanelProps) {
  return (
    <div className="space-y-3 text-center">
      <div className="overflow-hidden rounded-xl border border-border bg-white p-2">
        <Image
          src="/company-qr.jpeg"
          alt="Company DuitNow QR code — scan to pay"
          width={1202}
          height={1280}
          sizes="(min-width: 640px) 380px, 88vw"
          className="mx-auto h-auto w-full rounded-lg"
        />
      </div>
      <p className="text-2xl font-extrabold tabular-nums text-foreground">
        {formatPrice(amountCents)}
      </p>
      <p className="text-xs text-muted-foreground">
        Ask the customer to scan with any Malaysian banking app or e-wallet,
        then confirm once the payment is received.
      </p>
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  )
}
