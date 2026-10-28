'use client'

import { useCallback, useEffect, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Armchair, Loader2, Printer, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useRoleGuard } from '@/hooks/use-role-guard'
import { useIsClient } from '@/hooks/useIsClient'
import { useToastStore } from '@/stores/toast'
import { getBrowserClient } from '@/lib/supabase/client'
import { tableQrUrl } from '@/lib/pos/tables'
import type { TableWithToken } from '@/lib/pos/types'
import { TableCard } from './components/TableCard'
import { TableFormModal } from './components/TableFormModal'

export default function AdminTablesPage() {
  const { hasAccess, isLoading: accessLoading } = useRoleGuard(['admin', 'manager'])
  const addToast = useToastStore((state) => state.addToast)

  const [tables, setTables] = useState<TableWithToken[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // `NEXT_PUBLIC_URL` is validated in production; the browser origin covers
  // local previews. Read it only after mount so SSR and the first client render
  // agree (a relative QR is harmless until the print/download interaction).
  const isClient = useIsClient()
  const baseUrl =
    process.env.NEXT_PUBLIC_URL || (isClient ? window.location.origin : '')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TableWithToken | null>(null)
  const [rotating, setRotating] = useState<TableWithToken | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadTables = useCallback(async () => {
    const supabase = getBrowserClient()
    const { data, error: loadError } = await supabase
      .from('restaurant_tables')
      .select('id, label, zone, seats, qr_token, is_active, sort_order')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true })

    if (loadError) {
      setError(loadError.message)
    } else {
      setTables((data ?? []) as TableWithToken[])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!hasAccess) return
    // Async fetch; state updates happen after the awaits.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTables()
  }, [hasAccess, loadTables])

  const handleSaved = useCallback(() => {
    addToast({ type: 'success', title: 'Table saved' })
    loadTables()
  }, [addToast, loadTables])

  const handleToggleActive = useCallback(
    async (table: TableWithToken) => {
      setBusyId(table.id)
      try {
        const res = await fetch(`/api/admin/tables/${table.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !table.is_active }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          addToast({
            type: 'error',
            title: 'Could not update table',
            description: data?.error,
          })
          return
        }
        addToast({
          type: 'success',
          title: table.is_active ? 'Table deactivated' : 'Table activated',
        })
        loadTables()
      } catch {
        addToast({ type: 'error', title: 'Network error' })
      } finally {
        setBusyId(null)
      }
    },
    [addToast, loadTables]
  )

  const handleRotate = useCallback(async () => {
    if (!rotating) return
    const table = rotating
    setBusyId(table.id)
    try {
      const res = await fetch(`/api/admin/tables/${table.id}/rotate-token`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        addToast({
          type: 'error',
          title: 'Could not rotate the QR',
          description: data?.error,
        })
        return
      }
      addToast({
        type: 'success',
        title: 'QR code rotated',
        description: 'Previously printed codes for this table no longer work.',
      })
      setRotating(null)
      loadTables()
    } catch {
      addToast({ type: 'error', title: 'Network error' })
    } finally {
      setBusyId(null)
    }
  }, [rotating, addToast, loadTables])

  if (accessLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Manager access required.</p>
      </div>
    )
  }

  const activeTables = tables.filter((table) => table.is_active)

  return (
    <>
      <div className="print:hidden">
        <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
                Tables
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage the floor plan and print a QR code for every table.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => window.print()}
                disabled={activeTables.length === 0}
              >
                <Printer className="h-4 w-4" />
                Print QR sheet
              </Button>
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus className="h-4 w-4" />
                Add table
              </Button>
            </div>
          </header>

          <Card className="border-border bg-card">
            <CardContent className="flex items-start gap-3 pt-4">
              <Armchair className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How table QR ordering works</p>
                <p className="mt-1">
                  A diner scans the table&apos;s QR, picks dishes, enters pax and sends
                  the order. It appears on the kitchen display as an unpaid dine-in
                  ticket; the cashier collects cash or QR Pay in the POS table board.
                  Deactivating a table stops its QR from accepting orders without
                  deleting its history.
                </p>
              </div>
            </CardContent>
          </Card>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Failed to load tables: {error}
            </p>
          )}

          {tables.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Armchair className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-foreground">No tables yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add your first table to generate its QR code.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add table
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  baseUrl={baseUrl}
                  busy={busyId === table.id}
                  onEdit={(value) => {
                    setEditing(value)
                    setFormOpen(true)
                  }}
                  onRotate={setRotating}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Print-only sheet: one QR card per active table. */}
      <div className="hidden print:block">
        <h1 className="mb-6 text-center text-2xl font-bold">Mad Krapow — Table QR Codes</h1>
        <div className="grid grid-cols-2 gap-6">
          {activeTables.map((table) => (
            <div
              key={table.id}
              className="flex flex-col items-center gap-2 rounded-lg border border-black/20 p-4"
            >
              <QRCodeCanvas
                value={tableQrUrl(table.qr_token, baseUrl)}
                size={320}
                style={{ width: 220, height: 220 }}
                level="M"
                marginSize={2}
                bgColor="#FFFFFF"
                fgColor="#111111"
              />
              <p className="text-lg font-bold">{table.label}</p>
              <p className="text-xs">Scan to order from your table</p>
            </div>
          ))}
        </div>
      </div>

      <TableFormModal
        key={`${editing?.id ?? 'new-table'}-${formOpen ? 'open' : 'closed'}`}
        open={formOpen}
        table={editing}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmModal
        open={rotating !== null}
        onClose={() => setRotating(null)}
        title={`Rotate QR for ${rotating?.label ?? 'this table'}?`}
        description="The current QR code and link stop working immediately. Reprint and replace the table's QR after rotating."
        confirmLabel="Rotate QR"
        variant="warning"
        loading={rotating !== null && busyId === rotating.id}
        onConfirm={handleRotate}
      />
    </>
  )
}
