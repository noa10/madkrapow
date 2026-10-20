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
    <ClientPageShell>
      <div className="bg-background">
        <div className="mx-auto max-w-7xl px-4 pt-8 pb-2 sm:px-6 sm:pt-10 lg:px-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.11em] text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" />
            Quick order
          </div>
          <h1 className="font-display text-[clamp(1.875rem,1.2rem+2.6vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground">
            Order <span className="text-ember-text">Now</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
            Pick a dish, add it to your cart, and check out. Tap a card for full details and customization.
          </p>
        </div>
        <MenuListView categories={categories} quickAddEnabled />
      </div>
    </ClientPageShell>
  )
}
