import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCategories, getModifierGroupsByItem } from '@/lib/queries/menu'
import { getServiceClient } from '@/lib/supabase/server'
import type { PublicTable } from '@/lib/pos/types'
import { TableOrderClient } from './TableOrderClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Order at your table — Mad Krapow',
  // Table QR links are private capability URLs; keep them out of search.
  robots: { index: false, follow: false },
}

interface TableOrderPageProps {
  params: Promise<{ token: string }>
}

/**
 * Public, login-free table ordering page.
 *
 * The token is resolved with the service-role client on the server, so the
 * `restaurant_tables` table never needs an anonymous SELECT policy (tokens
 * cannot be enumerated through PostgREST). Only the safe table fields are
 * passed to the client.
 */
export default async function TableOrderPage({ params }: TableOrderPageProps) {
  const { token } = await params

  if (!token || token.length < 16 || token.length > 128) {
    notFound()
  }

  const supabase = getServiceClient()
  const { data: table } = await supabase
    .from('restaurant_tables')
    .select('id, label, zone, seats, is_active')
    .eq('qr_token', token)
    .maybeSingle()

  if (!table || !table.is_active) {
    notFound()
  }

  let categories
  let modifierGroupsByItem
  try {
    ;[categories, modifierGroupsByItem] = await Promise.all([
      getCategories(),
      getModifierGroupsByItem(),
    ])
  } catch (error) {
    console.error('[TableOrder] Failed to load menu:', error)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Menu temporarily unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please ask a staff member to take your order.
          </p>
        </div>
      </main>
    )
  }

  const publicTable: PublicTable = {
    id: table.id as string,
    token,
    label: table.label as string,
    zone: (table.zone as string | null) ?? null,
    seats: table.seats as number,
  }

  return (
    <TableOrderClient
      table={publicTable}
      categories={categories}
      modifierGroupsByItem={modifierGroupsByItem}
    />
  )
}
