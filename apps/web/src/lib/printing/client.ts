/**
 * Browser-side print delivery: the /pos and admin pages talk to the LAN print
 * bridge over http://localhost (Chrome exempts localhost from mixed-content
 * blocking). Unconfigured bridge = silent no-op so pages stay usable without
 * printing hardware.
 */

export type PrintJobType = 'kitchen_docket' | 'receipt' | 'grabfood_ticket'

export function isPrintBridgeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PRINT_BRIDGE_URL)
}

export interface BridgePrintResult {
  ok: boolean
  error?: string
}

export async function printReceiptInBrowser(orderId: string): Promise<BridgePrintResult> {
  const popup = window.open('', '_blank')
  if (!popup) return { ok: false, error: 'Allow pop-ups to print a receipt.' }
  popup.opener = null
  popup.document.title = 'Loading receipt'
  popup.document.body.textContent = 'Loading receipt…'

  try {
    const res = await fetch('/api/print/jobs/receipt-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId }),
    })
    if (!res.ok) throw new Error(`Unable to load receipt (HTTP ${res.status})`)
    const data = await res.json() as { html: string }
    if (popup.closed) return { ok: false, error: 'Receipt window was closed.' }
    popup.document.open()
    popup.document.write(data.html)
    popup.document.close()

    const button = popup.document.createElement('button')
    button.textContent = 'Print receipt'
    button.onclick = () => popup.print()
    popup.document.body.prepend(button)
    const style = popup.document.createElement('style')
    style.textContent = '@media print { button { display: none; } }'
    popup.document.head.append(style)
    popup.focus()
    popup.print()
    return { ok: true }
  } catch (err) {
    popup.close()
    return { ok: false, error: err instanceof Error ? err.message : 'Unable to load receipt' }
  }
}

export async function printViaBridge(
  orderId: string,
  type: PrintJobType
): Promise<BridgePrintResult> {
  const base = process.env.NEXT_PUBLIC_PRINT_BRIDGE_URL
  if (!base) return { ok: false, error: 'Print bridge not configured' }

  const token = process.env.NEXT_PUBLIC_PRINT_BRIDGE_TOKEN
  try {
    const res = await fetch(`${base}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ order_id: orderId, type }),
    })
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: data.error ?? `Bridge returned HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Bridge unreachable' }
  }
}
