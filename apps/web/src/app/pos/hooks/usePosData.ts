'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import type { Modifier, ModifierGroup } from '@/lib/queries/menu'
import { OPEN_DINE_IN_STATUSES, type PosOpenOrder, type RestaurantTable } from '@/lib/pos/types'
import { normaliseOpenOrder, type PosOpenOrderRow } from '@/lib/pos/tables'

export interface PosCategory {
  id: string
  name: string
  sort_order: number
}

export interface PosMenuItem {
  id: string
  name: string
  description: string | null
  image_url: string | null
  price_cents: number
  is_available: boolean
  category_id: string
  sort_order: number
}

/** A group attached to a menu item, in the shape the shared modifier UI expects. */
export type PosModifierGroup = ModifierGroup & {
  is_required: boolean
  modifiers: Modifier[]
}

const POS_ORDER_COLUMNS =
  'id, display_code, status, total_cents, created_at, customer_name, pax, table_id, table_label, delivery_type, source'

/** Dine-in cards expand to show the dishes; take-away rows do not, so skip the payload there. */
const POS_ORDER_COLUMNS_WITH_ITEMS = `${POS_ORDER_COLUMNS}, order_items(id, menu_item_name, quantity, line_total_cents, notes, order_item_modifiers(modifier_name, modifier_price_delta_cents))`

/**
 * Data for the counter POS: the sellable menu, the active floor plan and the
 * open dine-in orders that make tables occupied.
 *
 * Reads go straight to Supabase with the staff JWT (RLS), matching the admin
 * screens. Mutations go through the POS API routes.
 */
export function usePosData(enabled: boolean) {
  const [categories, setCategories] = useState<PosCategory[]>([])
  const [menuItems, setMenuItems] = useState<PosMenuItem[]>([])
  const [modifierGroupsByItem, setModifierGroupsByItem] = useState<
    Map<string, PosModifierGroup[]>
  >(new Map())
  const [itemsWithModifiers, setItemsWithModifiers] = useState<Set<string>>(
    new Set()
  )
  const [noModifierItems, setNoModifierItems] = useState<Set<string>>(new Set())
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [openOrders, setOpenOrders] = useState<PosOpenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadMenu = useCallback(async () => {
    const supabase = getBrowserClient()
    const [categoriesResult, itemsResult, junctionResult] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select('id, name, description, image_url, price_cents, is_available, category_id, sort_order')
        .order('sort_order', { ascending: true }),
      supabase
        .from('menu_item_modifier_groups')
        .select('menu_item_id, modifier_group_id, is_required'),
    ])

    if (categoriesResult.error || itemsResult.error || junctionResult.error) {
      setError(
        categoriesResult.error?.message ??
          itemsResult.error?.message ??
          junctionResult.error?.message ??
          'Failed to load menu'
      )
      return
    }

    const junctions = (junctionResult.data ?? []) as {
      menu_item_id: string
      modifier_group_id: string
      is_required: boolean
    }[]
    const groupIds = [...new Set(junctions.map((junction) => junction.modifier_group_id))]

    let groups: ModifierGroup[] = []
    let modifiers: Modifier[] = []
    if (groupIds.length > 0) {
      const [groupsResult, modifiersResult] = await Promise.all([
        supabase
          .from('modifier_groups')
          .select('*')
          .in('id', groupIds)
          .order('sort_order', { ascending: true }),
        supabase
          .from('modifiers')
          .select('*')
          .in('modifier_group_id', groupIds)
          .eq('is_available', true)
          .order('sort_order', { ascending: true }),
      ])
      if (groupsResult.error || modifiersResult.error) {
        setError(
          groupsResult.error?.message ??
            modifiersResult.error?.message ??
            'Failed to load add-ons'
        )
        return
      }
      groups = (groupsResult.data ?? []) as ModifierGroup[]
      modifiers = (modifiersResult.data ?? []) as Modifier[]
    }

    const groupsById = new Map(groups.map((group) => [group.id, group]))
    const modifiersByGroup = new Map<string, Modifier[]>()
    for (const modifier of modifiers) {
      const list = modifiersByGroup.get(modifier.modifier_group_id) ?? []
      list.push(modifier)
      modifiersByGroup.set(modifier.modifier_group_id, list)
    }

    const byItem = new Map<string, PosModifierGroup[]>()
    for (const junction of junctions) {
      const group = groupsById.get(junction.modifier_group_id)
      if (!group) continue
      const list = byItem.get(junction.menu_item_id) ?? []
      list.push({
        ...group,
        is_required: junction.is_required,
        modifiers: modifiersByGroup.get(group.id) ?? [],
      })
      byItem.set(junction.menu_item_id, list)
    }

    setCategories((categoriesResult.data ?? []) as PosCategory[])
    setMenuItems((itemsResult.data ?? []) as PosMenuItem[])
    setModifierGroupsByItem(byItem)
    setItemsWithModifiers(
      new Set(junctions.map((junction) => junction.menu_item_id))
    )
  }, [])

  /**
   * Live fallback for a single dish, used when the prefetched index is stale
   * or empty (e.g. the page loaded before a menu edit). Returns `null` on a
   * query error so the caller can refuse to add a dish that may have options.
   */
  const loadModifierGroupsForItem = useCallback(
    async (itemId: string): Promise<PosModifierGroup[] | null> => {
      const supabase = getBrowserClient()
      const { data: junctions, error: junctionError } = await supabase
        .from('menu_item_modifier_groups')
        .select('menu_item_id, modifier_group_id, is_required')
        .eq('menu_item_id', itemId)

      if (junctionError) return null
      if (!junctions || junctions.length === 0) {
        setNoModifierItems((previous) => {
          if (previous.has(itemId)) return previous
          const next = new Set(previous)
          next.add(itemId)
          return next
        })
        return []
      }

      const rows = junctions as {
        menu_item_id: string
        modifier_group_id: string
        is_required: boolean
      }[]
      const groupIds = [...new Set(rows.map((row) => row.modifier_group_id))]

      const [groupsResult, modifiersResult] = await Promise.all([
        supabase
          .from('modifier_groups')
          .select('*')
          .in('id', groupIds)
          .order('sort_order', { ascending: true }),
        supabase
          .from('modifiers')
          .select('*')
          .in('modifier_group_id', groupIds)
          .eq('is_available', true)
          .order('sort_order', { ascending: true }),
      ])

      if (groupsResult.error || modifiersResult.error) return null

      const groups = (groupsResult.data ?? []) as ModifierGroup[]
      const modifiers = (modifiersResult.data ?? []) as Modifier[]
      const groupsById = new Map(groups.map((group) => [group.id, group]))
      const modifiersByGroup = new Map<string, Modifier[]>()
      for (const modifier of modifiers) {
        const list = modifiersByGroup.get(modifier.modifier_group_id) ?? []
        list.push(modifier)
        modifiersByGroup.set(modifier.modifier_group_id, list)
      }

      const loaded: PosModifierGroup[] = []
      for (const row of rows) {
        const group = groupsById.get(row.modifier_group_id)
        if (!group) continue
        loaded.push({
          ...group,
          is_required: row.is_required,
          modifiers: modifiersByGroup.get(group.id) ?? [],
        })
      }

      setItemsWithModifiers((previous) => {
        if (previous.has(itemId)) return previous
        const next = new Set(previous)
        next.add(itemId)
        return next
      })
      setNoModifierItems((previous) => {
        if (!previous.has(itemId)) return previous
        const next = new Set(previous)
        next.delete(itemId)
        return next
      })
      setModifierGroupsByItem((previous) => {
        if (previous.has(itemId)) return previous
        const next = new Map(previous)
        next.set(itemId, loaded)
        return next
      })

      return loaded
    },
    []
  )

  const loadTables = useCallback(async () => {
    const supabase = getBrowserClient()
    const { data, error: tablesError } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })

    if (tablesError) {
      setError(tablesError.message)
      return
    }
    setTables((data ?? []) as RestaurantTable[])
  }, [])

  const loadOpenOrders = useCallback(async () => {
    const supabase = getBrowserClient()
    // Two independent sets: open dine-in orders drive the floor board, and
    // pending counter take-away orders are the "collect later" queue.
    const [dineInResult, takeawayResult] = await Promise.all([
      supabase
        .from('orders')
        .select(POS_ORDER_COLUMNS_WITH_ITEMS)
        .eq('delivery_type', 'dine_in')
        .in('status', OPEN_DINE_IN_STATUSES)
        .order('created_at', { ascending: true }),
      supabase
        .from('orders')
        .select(POS_ORDER_COLUMNS)
        .eq('source', 'counter')
        .eq('delivery_type', 'self_pickup')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
    ])

    if (dineInResult.error || takeawayResult.error) {
      setError(dineInResult.error?.message ?? takeawayResult.error?.message ?? 'Failed to load orders')
      return
    }
    setOpenOrders([
      ...((dineInResult.data ?? []) as PosOpenOrderRow[]).map(normaliseOpenOrder),
      ...((takeawayResult.data ?? []) as PosOpenOrderRow[]).map(normaliseOpenOrder),
    ])
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([loadTables(), loadOpenOrders()])
  }, [loadTables, loadOpenOrders])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    // Async fetch; state updates happen after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadMenu(), loadTables(), loadOpenOrders()])
      .catch(() => setError('Failed to load POS data'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [enabled, loadMenu, loadTables, loadOpenOrders])

  // Realtime keeps the table board and the unpaid take-away queue current.
  // A Realtime filter can only express one predicate, and we need both
  // dine-in and counter take-away events, so refresh on any order event
  // (debounced — status + payment rows can land in quick succession).
  useEffect(() => {
    if (!enabled) return
    const supabase = getBrowserClient()

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => {
        void loadOpenOrders()
      }, 300)
    }

    const channel = supabase
      .channel('pos-open-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        scheduleRefresh
      )
      .subscribe()

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      supabase.removeChannel(channel)
    }
  }, [enabled, loadOpenOrders])

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, PosMenuItem[]>()
    for (const item of menuItems) {
      if (!item.is_available) continue
      const list = map.get(item.category_id) ?? []
      list.push(item)
      map.set(item.category_id, list)
    }
    return map
  }, [menuItems])

  return {
    categories,
    menuItems,
    itemsByCategory,
    modifierGroupsByItem,
    itemsWithModifiers,
    noModifierItems,
    loadModifierGroupsForItem,
    tables,
    openOrders,
    loading,
    error,
    refresh,
  }
}
