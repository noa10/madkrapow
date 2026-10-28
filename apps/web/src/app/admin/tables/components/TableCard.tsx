'use client'

import { useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Copy, Download, Loader2, Pencil, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToastStore } from '@/stores/toast'
import { tableQrUrl } from '@/lib/pos/tables'
import type { TableWithToken } from '@/lib/pos/types'

interface TableCardProps {
  table: TableWithToken
  baseUrl: string
  busy: boolean
  onEdit: (table: TableWithToken) => void
  onRotate: (table: TableWithToken) => void
  onToggleActive: (table: TableWithToken) => void
}

/** A floor table with its printable QR code and management actions. */
export function TableCard({
  table,
  baseUrl,
  busy,
  onEdit,
  onRotate,
  onToggleActive,
}: TableCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const addToast = useToastStore((state) => state.addToast)
  const qrUrl = tableQrUrl(table.qr_token, baseUrl)

  const handleDownload = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `table-${table.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-qr.png`
    link.click()
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl)
      addToast({ type: 'success', title: 'Table link copied' })
    } catch {
      addToast({ type: 'error', title: 'Could not copy the link' })
    }
  }

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-foreground">{table.label}</h2>
          <p className="text-xs text-muted-foreground">
            {[table.zone, `${table.seats} seats`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Badge
          className={
            table.is_active
              ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
              : 'border-white/15 bg-white/5 text-muted-foreground'
          }
        >
          {table.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="flex justify-center rounded-lg bg-white p-3">
        <QRCodeCanvas
          ref={canvasRef}
          value={qrUrl}
          // 2× the display size so the downloaded PNG stays sharp in print.
          size={296}
          style={{ width: 148, height: 148 }}
          level="M"
          marginSize={1}
          bgColor="#FFFFFF"
          fgColor="#111111"
          aria-label={`QR code for table ${table.label}`}
        />
      </div>

      <p className="truncate text-[11px] text-muted-foreground" title={qrUrl}>
        {qrUrl}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={() => onEdit(table)} disabled={busy}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy}>
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy} disabled={busy}>
          <Copy className="h-3.5 w-3.5" />
          Copy link
        </Button>
        <Button variant="outline" size="sm" onClick={() => onRotate(table)} disabled={busy}>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Rotate QR
        </Button>
      </div>

      <Button
        variant={table.is_active ? 'ghost' : 'default'}
        size="sm"
        onClick={() => onToggleActive(table)}
        disabled={busy}
        className="w-full"
      >
        {table.is_active ? 'Deactivate table' : 'Activate table'}
      </Button>
    </article>
  )
}
