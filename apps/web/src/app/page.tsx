import { Suspense } from 'react'
import {
  getCategories,
  getModifierGroupsByItem,
  type CategoryWithMenuItems,
  type ModifierGroupsByMenuItem,
} from '@/lib/queries/menu'
import { ClientPageShell } from '@/components/layout/ClientPageShell'
import { HeroView } from '@/components/home/HeroView'
import { MenuCatalogView } from '@/components/menu/MenuCatalogView'
import { MenuListView } from '@/components/menu/MenuListView'
import { HowToOrderSection } from '@/components/home/HowToOrderSection'
import { HowItWorksSection } from '@/components/home/HowItWorksSection'

const RICH_MENU_ENABLED = process.env.NEXT_PUBLIC_RICH_MENU_V2 !== '0'

async function getMenuData(): Promise<CategoryWithMenuItems[]> {
  try {
    return await getCategories()
  } catch (error) {
    console.error('Failed to fetch menu:', error)
    return []
  }
}

async function getModifiersData(): Promise<ModifierGroupsByMenuItem | null> {
  if (!RICH_MENU_ENABLED) return {}
  try {
    return await getModifierGroupsByItem()
  } catch (error) {
    console.error('Failed to fetch menu modifiers:', error)
    // `null` (not `{}`): the catalog must not treat failed modifier data as
    // "item has no options", which would bypass required-option validation.
    // Items that need modifiers fall back to their item page instead.
    return null
  }
}

/**
 * The storefront is the single ordering surface (original one-page design):
 * hero → menu (search / categories / dishes) → how to order → how it works.
 * The `/menu` route redirects here for old links and QR codes.
 */
export default async function Home() {
  const [categories, modifierGroupsByItem] = await Promise.all([
    getMenuData(),
    getModifiersData(),
  ])

  return (
    <ClientPageShell>
      <HeroView />
      {/* A Suspense boundary keeps any search-param-driven client state in
          the menu from deopting the whole storefront to client rendering. */}
      <Suspense fallback={<div className="min-h-screen" aria-hidden />}>
        {RICH_MENU_ENABLED ? (
          <MenuCatalogView categories={categories} modifierGroupsByItem={modifierGroupsByItem} />
        ) : (
          <div id="menu" className="scroll-mt-[var(--topbar-h)]">
            <MenuListView categories={categories} />
          </div>
        )}
      </Suspense>
      <HowToOrderSection />
      <HowItWorksSection />
    </ClientPageShell>
  )
}
