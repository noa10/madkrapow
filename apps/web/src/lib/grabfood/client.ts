/**
 * GrabFood Partner API client.
 *
 * Base URLs (per Grab docs):
 *   staging:     https://partner-api.grab.com/grabfood-sandbox
 *   production:  https://partner-api.grab.com/grabfood
 *   mock:        no network — methods return synthetic responses so the
 *                full order-ingestion flow can be exercised locally.
 *
 * Endpoints used (v1.1.3):
 *   POST /partner/v1/order/prepare       accept/reject order
 *   POST /partner/v1/orders/mark         mark order ready
 *   PUT  /partner/v1/order/cancel        cancel order
 *   GET  /partner/v1/orders              list orders (<= 30 days)
 *   PUT  /partner/v1/menu                update menu record
 *   PUT  /partner/v1/batch/menu          batch update menu records (<= 200)
 *   POST /partner/v1/merchant/menu/notification  notify menu changed
 */

import { env } from '@/lib/validators/env'
import { getAccessToken, clearGrabFoodTokenCache, isGrabFoodConfigured } from './auth'
import type { GrabListOrdersResponse, GrabMenuRecordUpdate } from './types'

export type GrabFoodEnvironment = 'mock' | 'staging' | 'production'

function baseUrlFor(envName: GrabFoodEnvironment): string {
  if (envName === 'production') {
    return 'https://partner-api.grab.com/grabfood'
  }
  return 'https://partner-api.grab.com/grabfood-sandbox'
}

export interface GrabRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  query?: Record<string, string>
}

export class GrabFoodApiError extends Error {
  readonly status: number
  readonly path: string
  constructor(message: string, status: number, path: string) {
    super(message)
    this.name = 'GrabFoodApiError'
    this.status = status
    this.path = path
  }
}

export class GrabFoodClient {
  private readonly environment: GrabFoodEnvironment
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(options?: { environment?: GrabFoodEnvironment; fetchImpl?: typeof fetch; timeoutMs?: number }) {
    this.environment = options?.environment ?? (env.GRABFOOD_ENV as GrabFoodEnvironment) ?? 'mock'
    this.fetchImpl = options?.fetchImpl ?? fetch
    this.timeoutMs = options?.timeoutMs ?? 15000
  }

  get isMock(): boolean {
    return this.environment === 'mock'
  }

  private async request<T>(opts: GrabRequestOptions, retryOn401 = true): Promise<T> {
    if (this.isMock) {
      // Mock mode: pretend success without touching the network.
      return { mock: true, path: opts.path, request: opts.body ?? null } as T
    }
    if (!isGrabFoodConfigured()) {
      throw new GrabFoodApiError('GrabFood API is not configured', 0, opts.path)
    }

    const url = new URL(baseUrlFor(this.environment) + opts.path)
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      url.searchParams.set(k, v)
    }

    const token = await getAccessToken(this.fetchImpl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let res: Response
    try {
      res = await this.fetchImpl(url.toString(), {
        method: opts.method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    // Stale/cleared token: retry once with a fresh token.
    if (res.status === 401 && retryOn401) {
      clearGrabFoodTokenCache()
      return this.request<T>(opts, false)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new GrabFoodApiError(
        `GrabFood API ${opts.method} ${opts.path} failed (${res.status}): ${text.slice(0, 300)}`,
        res.status,
        opts.path
      )
    }

    if (res.status === 204) return {} as T
    return (await res.json().catch(() => ({}))) as T
  }

  /** POST /partner/v1/order/prepare — accept the submitted order. */
  async acceptOrder(orderId: string): Promise<void> {
    await this.request({
      method: 'POST',
      path: '/partner/v1/order/prepare',
      body: { orderID: orderId },
    })
  }

  /** POST /partner/v1/orders/mark — notify Grab the order is ready. */
  async markOrderReady(orderId: string): Promise<void> {
    await this.request({
      method: 'POST',
      path: '/partner/v1/orders/mark',
      body: { orderID: orderId },
    })
  }

  /** PUT /partner/v1/order/cancel — cancel on Grab's side. */
  async cancelOrder(orderId: string, reason: string): Promise<void> {
    await this.request({
      method: 'PUT',
      path: '/partner/v1/order/cancel',
      body: { orderID: orderId, reason },
    })
  }

  /** GET /partner/v1/orders — window limited to 30 days by Grab. */
  async listOrders(dateFrom: string, dateTo?: string): Promise<GrabListOrdersResponse> {
    return this.request<GrabListOrdersResponse>({
      method: 'GET',
      path: '/partner/v1/orders',
      query: { dateFrom, ...(dateTo ? { dateTo } : {}) },
    })
  }

  /** PUT /partner/v1/menu — price/availability of a single item or modifier. */
  async updateMenuRecord(record: GrabMenuRecordUpdate): Promise<void> {
    await this.request({ method: 'PUT', path: '/partner/v1/menu', body: record })
  }

  /** PUT /partner/v1/batch/menu — up to 200 records, rate limit 1 req/s. */
  async batchUpdateMenuRecords(records: GrabMenuRecordUpdate[]): Promise<void> {
    await this.request({ method: 'PUT', path: '/partner/v1/batch/menu', body: records })
  }

  /** POST /partner/v1/merchant/menu/notification — tell Grab to pull the menu. */
  async notifyMenuUpdated(merchantId: string): Promise<void> {
    await this.request({
      method: 'POST',
      path: '/partner/v1/merchant/menu/notification',
      body: { merchantID: merchantId },
    })
  }
}

export function createGrabFoodClient(options?: ConstructorParameters<typeof GrabFoodClient>[0]): GrabFoodClient {
  return new GrabFoodClient(options)
}
