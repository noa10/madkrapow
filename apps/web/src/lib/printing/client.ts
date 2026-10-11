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

/**
 * Auto-print the standard job set for an order (fire-and-forget helper):
 * GrabFood orders print the GrabFood ticket; counter orders print the kitchen
 * docket + receipt. Failures surface through `onError` without throwing.
 */
export async function autoPrintOrder(
  orderId: string,
  source: string,
  onError?: (error: string) => void
): Promise<void> {
  if (!isPrintBridgeConfigured()) return
  const types: PrintJobType[] =
    source === 'grabfood'
      ? ['grabfood_ticket']
      : source === 'counter'
        ? ['kitchen_docket', 'receipt']
        : ['kitchen_docket']
  for (const type of types) {
    const result = await printViaBridge(orderId, type)
    if (!result.ok) onError?.(result.error ?? 'Unknown print error')
  }
}
