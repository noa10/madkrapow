import Link from 'next/link'

export default function TableNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Mad Krapow
        </p>
        <h1 className="mt-2 font-display text-2xl font-extrabold text-foreground">
          This table QR isn&apos;t active
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The table code may have changed. Please ask a staff member for help and
          scan the QR on your table again.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-border-2 px-5 text-sm font-bold text-foreground transition hover:bg-surface-2"
        >
          Browse the menu
        </Link>
      </div>
    </main>
  )
}
