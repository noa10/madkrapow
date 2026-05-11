import { getCategories, type CategoryWithMenuItems } from '@/lib/queries/menu'
import { MenuListView } from '@/components/menu/MenuListView'
import { ClientPageShell } from '@/components/layout/ClientPageShell'

async function getMenuData(): Promise<CategoryWithMenuItems[]> {
  try {
    return await getCategories()
  } catch (error) {
    console.error('Failed to fetch menu:', error)
    return []
  }
}

export default async function OrderPage() {
  const categories = await getMenuData()

  return (
    <ClientPageShell activeHref="/order">
      <div className="relative bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,176,123,0.18),transparent_30%),linear-gradient(180deg,rgba(8,8,8,0.92)_0%,rgba(8,8,8,1)_100%)]" />
        <div className="relative">
          <div className="max-w-7xl mx-auto px-4 pt-10 pb-4 sm:pt-14">
            <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[var(--gold-strong)]">
              <span className="h-2 w-2 rounded-full bg-[var(--gold-strong)]" />
              Quick order
            </div>
            <h1 className="font-display text-4xl leading-tight text-white sm:text-5xl">
              Order Now
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#d8d1c6] sm:text-lg">
              Pick a dish, add it to your cart, and check out. Tap a card for full details and customization.
            </p>
          </div>
          <MenuListView categories={categories} quickAddEnabled />
        </div>
      </div>
    </ClientPageShell>
  )
}
