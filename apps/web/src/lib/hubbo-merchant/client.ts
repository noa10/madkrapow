/**
 * Hubbo merchant backend client — UNOFFICIAL (see docs/hubbo-re-findings.md).
 *
 * Endpoints used (recovered from the Hubbo POS app):
 *   POST /api/merchant/login      device login -> body.apiKey (see auth.ts)
 *   GET  /api/merchant/menu       full menu incl. per-channel prices + snooze
 *   POST /api/merchant/snoozeMenu time-based sold-out push
 *
 * Every request sends the `apiKey` header + `X-Request-Id` UUID. The menu
 * endpoint returns a FLAT envelope ({code, message, menu[], categories[], ...})
 * — payload at the top level, NOT wrapped in `body` (confirmed on a live pull),
 * so the client must not read `envelope.body` for it. The string "200" marks
 * success; the client throws HubboMerchantApiError otherwise.
 */

import {
  getHubboMerchantSession,
  hubboMerchantBaseUrl,
  isHubboMerchantConfigured,
} from './auth'
import type { HubboMerchantEnvelope, HubboMerchantMenuResponse, HubboSnoozeMenuItem } from './types'

export class HubboMerchantApiError extends Error {
  readonly status: number
  readonly path: string
  constructor(message: string, status: number, path: string) {
    super(message)
    this.name = 'HubboMerchantApiError'
    this.status = status
    this.path = path
  }
}

export interface HubboMerchantRequestOptions {
  method: 'GET' | 'POST'
  path: string
  body?: unknown
}

export class HubboMerchantClient {
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options?: { fetchImpl?: typeof fetch; timeoutMs?: number }) {
    this.fetchImpl = options?.fetchImpl ?? fetch
    this.timeoutMs = options?.timeoutMs ?? 15000
  }

  private async requestRaw(opts: HubboMerchantRequestOptions): Promise<HubboMerchantEnvelope<unknown>> {
    if (!isHubboMerchantConfigured()) {
      throw new HubboMerchantApiError('Hubbo merchant backend is not configured', 0, opts.path)
    }

    const session = await getHubboMerchantSession(this.fetchImpl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let res: Response
    try {
      res = await this.fetchImpl(hubboMerchantBaseUrl() + opts.path, {
        method: opts.method,
        headers: {
          apiKey: session.apiKey,
          'X-Request-Id': crypto.randomUUID(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new HubboMerchantApiError(
        `Hubbo merchant ${opts.method} ${opts.path} failed (${res.status}): ${text.slice(0, 300)}`,
        res.status,
        opts.path
      )
    }

    const envelope = (await res.json().catch(() => ({}))) as HubboMerchantEnvelope<unknown>
    if (envelope.code !== undefined && envelope.code !== '200') {
      throw new HubboMerchantApiError(
        `Hubbo merchant ${opts.method} ${opts.path} error ${envelope.code}: ${envelope.message ?? envelope.reason ?? 'unknown'}`,
        res.status,
        opts.path
      )
    }
    return envelope
  }

  /** Generic request for body-wrapped endpoints (unwraps `envelope.body`). */
  private async request<T>(opts: HubboMerchantRequestOptions): Promise<T> {
    const envelope = await this.requestRaw(opts)
    return envelope.body as T
  }

  /** GET /api/merchant/menu — full merchant menu (flat envelope). */
  async getMenu(): Promise<HubboMerchantMenuResponse> {
    // Menu payload is FLAT (menu[]/categories[] at top level), not under `body`.
    // We still reuse requestRaw()'s auth + status + code checking, then return
    // the flat envelope itself rather than envelope.body.
    return this.requestRaw({ method: 'GET', path: '/api/merchant/menu' }) as Promise<HubboMerchantMenuResponse>
  }

  /** POST /api/merchant/snoozeMenu — push time-based sold-out entries. */
  async snoozeMenu(items: HubboSnoozeMenuItem[]): Promise<void> {
    await this.request({ method: 'POST', path: '/api/merchant/snoozeMenu', body: items })
  }
}

export function createHubboMerchantClient(
  options?: ConstructorParameters<typeof HubboMerchantClient>[0]
): HubboMerchantClient {
  return new HubboMerchantClient(options)
}
