'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { OPEN_DINE_IN_STATUSES, type PosOpenOrder, type RestaurantTable } from '@/lib/pos/types'

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

const POS_ORDER_COLUMNS =
  'id, display_code, status, total_cents, created_at, customer_name, pax, table_id, table_label, delivery_type, source'

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
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [openOrders, setOpenOrders] = useState<PosOpenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadMenu = useCallback(async () => {
    const supabase = getBrowserClient()
    const [categoriesResult, itemsResult] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('menu_items')
        .select('id, name, description, image_url, price_cents, is_available, category_id, sort_order')
        .order('sort_order', { ascending: true }),
    ])

    if (categoriesResult.error || itemsResult.error) {
      setError(categoriesResult.error?.message ?? itemsResult.error?.message ?? 'Failed to load menu')
      return
    }
    setCategories((categoriesResult.data ?? []) as PosCategory[])
    setMenuItems((itemsResult.data ?? []) as PosMenuItem[])
  }, [])

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
        .select(POS_ORDER_COLUMNS)
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
      ...((dineInResult.data ?? []) as PosOpenOrder[]),
      ...((takeawayResult.data ?? []) as PosOpenOrder[]),
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
    tables,
    openOrders,
    loading,
    error,
    refresh,
  }
}
