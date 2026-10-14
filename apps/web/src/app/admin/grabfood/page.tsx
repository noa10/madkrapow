'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { useRoleGuard } from '@/hooks/use-role-guard'
import { useToastStore } from '@/stores/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  PauseCircle,
  PlayCircle,
  ScanSearch,
  Timer,
  TimerOff,
} from 'lucide-react'

/**
 * GrabFood channel admin: local↔Grab item mapping, sold-out (snooze), menu
 * trace and the store pause toggle. Everything degrades gracefully while the
 * integration runs in mock mode (GRABFOOD_ENV=mock).
 */

interface MappingRow {
  channel_product_id: string
  menu_item_id: string
  menu_item_name: string
  menu_item_price_cents: number
  menu_item_is_available: boolean
  menu_item_snooze_till: string | null
  external_item_id: string | null
  external_name: string | null
  channel_price_cents: number | null
  channel_is_available: boolean
  channel_snooze_till: string | null
}

interface UnmappedItem {
  id: string
  name: string
  price_cents: number
}

const SNOOZE_OPTIONS = [30, 60, 120] as const

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

export default function GrabFoodAdminPage() {
  const { hasAccess, isLoading: isAccessLoading } = useRoleGuard(['admin', 'manager'])
  const { addToast } = useToastStore()

  const [mappings, setMappings] = useState<MappingRow[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [storeOpened, setStoreOpened] = useState<boolean | null>(null)
  const [togglingPause, setTogglingPause] = useState(false)
  const [mappingDraft, setMappingDraft] = useState<Record<string, string>>({})
  const [busyItemId, setBusyItemId] = useState<string | null>(null)

  const getToken = useCallback(async () => {
    const supabase = getBrowserClient()
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  const loadMappings = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = getBrowserClient()
      const [{ data: mappingRows, error }, { data: allItems }] = await Promise.all([
        supabase
          .from('channel_products')
          .select(
            'id, external_item_id, external_name, price_cents, is_available, snooze_till, menu_items ( id, name, price_cents, is_available, snooze_till )'
          )
          .eq('channel', 'grabfood'),
        supabase
          .from('menu_items')
          .select('id, name, price_cents, is_available')
          .eq('is_available', true),
      ])
      if (error) throw error

      const rows: MappingRow[] = (mappingRows ?? []).map((row: Record<string, unknown>) => {
        const item = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items
        return {
          channel_product_id: row.id,
          menu_item_id: item?.id ?? '',
          menu_item_name: item?.name ?? '(deleted item)',
          menu_item_price_cents: item?.price_cents ?? 0,
          menu_item_is_available: item?.is_available ?? false,
          menu_item_snooze_till: item?.snooze_till ?? null,
          external_item_id: row.external_item_id,
          external_name: row.external_name,
          channel_price_cents: row.price_cents,
          channel_is_available: row.is_available,
          channel_snooze_till: row.snooze_till ?? null,
        }
      })
      setMappings(rows)

      const mappedItemIds = new Set(rows.map((r) => r.menu_item_id))
      setUnmapped(
        ((allItems ?? []) as UnmappedItem[])
          .filter((item) => !mappedItemIds.has(item.id))
          .map((item) => ({ id: item.id, name: item.name, price_cents: item.price_cents }))
      )
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Failed to load mappings',
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const loadStoreStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/grabfood/store/pause', {
        headers: await (async () => ({ authorization: `Bearer ${await getToken()}` }))(),
      })
      if (!res.ok) return
      const data = await res.json()
      setStoreOpened(data.is_opened ?? true)
    } catch {
      // Status display is best-effort.
    }
  }, [getToken])

  useEffect(() => {
    if (!hasAccess) return
    void loadMappings()
    void loadStoreStatus()
  }, [hasAccess, loadMappings, loadStoreStatus])

  const togglePause = useCallback(async () => {
    setTogglingPause(true)
    try {
      const res = await fetch('/api/integrations/grabfood/store/pause', {
        method: 'POST',
        headers: await (async () => ({
          'Content-Type': 'application/json',
          authorization: `Bearer ${await getToken()}`,
        }))(),
        body: JSON.stringify({ paused: storeOpened !== false }),
      })
      const data = await res.json()
      if (!res.ok) {
        addToast({ type: 'error', title: 'Store pause failed', description: data?.error })
        return
      }
      setStoreOpened(!data.paused)
      addToast({
        type: 'success',
        title: data.paused ? 'GrabFood store paused' : 'GrabFood store reopened',
      })
    } finally {
      setTogglingPause(false)
    }
  }, [storeOpened, getToken, addToast])

  const showTrace = useCallback(async () => {
    const res = await fetch('/api/integrations/grabfood/menu/trace', {
      headers: await (async () => ({ authorization: `Bearer ${await getToken()}` }))(),
    })
    const data = await res.json()
    if (!res.ok) {
      addToast({ type: 'error', title: 'Trace lookup failed', description: data?.error })
      return
    }
    addToast({
      type: 'info',
      title: 'Last menu sync on Grab',
      description: `${data.trace?.status ?? 'unknown'}${data.trace?.lastSyncTime ? ` at ${data.trace.lastSyncTime}` : ''}`,
    })
  }, [getToken, addToast])

  const snooze = useCallback(
    async (menuItemId: string, durationMinutes: number) => {
      setBusyItemId(menuItemId)
      try {
        const res = await fetch('/api/integrations/grabfood/menu/snooze', {
          method: 'POST',
          headers: await (async () => ({
            'Content-Type': 'application/json',
            authorization: `Bearer ${await getToken()}`,
          }))(),
          body: JSON.stringify({ menuItemId, durationMinutes }),
        })
        const data = await res.json()
        if (!res.ok) {
          addToast({ type: 'error', title: 'Snooze failed', description: data?.error })
          return
        }
        addToast({ type: 'success', title: `Sold out for ${durationMinutes} minutes` })
        await loadMappings()
      } finally {
        setBusyItemId(null)
      }
    },
    [getToken, addToast, loadMappings]
  )

  const restore = useCallback(
    async (menuItemId: string) => {
      setBusyItemId(menuItemId)
      try {
        const res = await fetch(
          `/api/integrations/grabfood/menu/snooze?menuItemId=${menuItemId}`,
          { method: 'DELETE', headers: await (async () => ({ authorization: `Bearer ${await getToken()}` }))() }
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          addToast({ type: 'error', title: 'Restore failed', description: data?.error })
          return
        }
        addToast({ type: 'success', title: 'Item available again' })
        await loadMappings()
      } finally {
        setBusyItemId(null)
      }
    },
    [getToken, addToast, loadMappings]
  )

  const createMapping = useCallback(
    async (menuItem: UnmappedItem) => {
      const externalId = mappingDraft[menuItem.id]?.trim()
      if (!externalId) {
        addToast({ type: 'error', title: 'Enter the GrabFood item ID first' })
        return
      }
      setBusyItemId(menuItem.id)
      try {
        const res = await fetch('/api/integrations/grabfood/menu/mapping', {
          method: 'POST',
          headers: await (async () => ({
            'Content-Type': 'application/json',
            authorization: `Bearer ${await getToken()}`,
          }))(),
          body: JSON.stringify({ menu_item_id: menuItem.id, external_item_id: externalId }),
        })
        const data = await res.json()
        if (!res.ok) {
          addToast({ type: 'error', title: 'Mapping failed', description: data?.error })
          return
        }
        addToast({ type: 'success', title: `${menuItem.name} mapped to GrabFood` })
        setMappingDraft((prev) => {
          const next = { ...prev }
          delete next[menuItem.id]
          return next
        })
        await loadMappings()
      } finally {
        setBusyItemId(null)
      }
    },
    [mappingDraft, getToken, addToast, loadMappings]
  )

  const unmap = useCallback(
    async (row: MappingRow) => {
      setBusyItemId(row.menu_item_id)
      try {
        const res = await fetch(
          `/api/integrations/grabfood/menu/mapping?channel_product_id=${row.channel_product_id}`,
          { method: 'DELETE', headers: await (async () => ({ authorization: `Bearer ${await getToken()}` }))() }
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          addToast({ type: 'error', title: 'Unmap failed', description: data?.error })
          return
        }
        addToast({ type: 'success', title: `${row.menu_item_name} unmapped` })
        await loadMappings()
      } finally {
        setBusyItemId(null)
      }
    },
    [getToken, addToast, loadMappings]
  )

  if (isAccessLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!hasAccess) {
    return <p className="p-8 text-muted-foreground">Admin/manager access required.</p>
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">GrabFood Channel</h1>
        <p className="text-sm text-muted-foreground">
          Mapping, sold-out (snooze), menu trace and store controls. Environment:{' '}
          <Badge variant="outline">mock or live per GRABFOOD_ENV</Badge>
        </p>
      </div>

      <section className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={showTrace}>
          <ScanSearch className="h-4 w-4 mr-2" />
          Check sync trace
        </Button>
        <Button variant="outline" onClick={togglePause} disabled={togglingPause || storeOpened === null}>
          {storeOpened === false ? (
            <PlayCircle className="h-4 w-4 mr-2" />
          ) : (
            <PauseCircle className="h-4 w-4 mr-2" />
          )}
          {storeOpened === false ? 'Reopen GrabFood store' : 'Pause GrabFood store'}
        </Button>
      </section>

      {unmapped.length > 0 && (
        <section className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
          <h2 className="font-semibold text-amber-600 mb-2">
            {unmapped.length} item(s) not mapped to GrabFood
          </h2>
          <div className="space-y-2">
            {unmapped.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.name}</span>
                <span className="text-sm text-muted-foreground">{formatPrice(item.price_cents)}</span>
                <Input
                  className="w-56"
                  placeholder="GrabFood item ID"
                  value={mappingDraft[item.id] ?? ''}
                  onChange={(e) =>
                    setMappingDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                />
                <Button
                  size="sm"
                  onClick={() => createMapping(item)}
                  disabled={busyItemId === item.id}
                >
                  Map
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-2">Mapped items ({mappings.length})</h2>
        {mappings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mappings yet — map items above, or pull a menu via the Hubbo adapter.
          </p>
        ) : (
          <div className="space-y-2">
            {mappings.map((row) => {
              const snoozed =
                (row.channel_snooze_till && new Date(row.channel_snooze_till) > new Date()) ||
                (row.menu_item_snooze_till && new Date(row.menu_item_snooze_till) > new Date())
              return (
                <div
                  key={row.channel_product_id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-48">
                    <div className="font-medium">{row.menu_item_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatPrice(row.channel_price_cents ?? row.menu_item_price_cents)}
                      {row.channel_price_cents !== null && ' (channel price)'}
                      {!row.menu_item_is_available && ' · master unavailable'}
                      {!row.channel_is_available && ' · channel unavailable'}
                    </div>
                  </div>
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {row.external_item_id ?? 'unmapped'}
                  </code>
                  {snoozed ? (
                    <Badge className="bg-orange-500 text-white">Sold out</Badge>
                  ) : (
                    <Badge variant="outline">Available</Badge>
                  )}
                  <div className="flex-1" />
                  {snoozed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restore(row.menu_item_id)}
                      disabled={busyItemId === row.menu_item_id}
                    >
                      <TimerOff className="h-4 w-4 mr-1" />
                      Restore
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Timer className="h-4 w-4 text-muted-foreground" />
                      {SNOOZE_OPTIONS.map((minutes) => (
                        <Button
                          key={minutes}
                          size="sm"
                          variant="outline"
                          onClick={() => snooze(row.menu_item_id, minutes)}
                          disabled={busyItemId === row.menu_item_id}
                        >
                          {minutes}m
                        </Button>
                      ))}
                    </div>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => unmap(row)}>
                    Unmap
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
