/**
 * GrabFood Partner API client (v1.1.3).
 *
 * Base URLs (Grab's official Node SDK config):
 *   staging:     https://partner-api.grab.com/grabfood-sandbox
 *   production:  https://partner-api.grab.com/grabfood
 *   mock:        no network — methods return synthetic responses so the
 *                full order-ingestion flow can be exercised locally.
 *
 * Every request uses the documented JSON contract. Request bodies here are
 * verified against the public guide and Grab's SDK models, not inferred.
 */

import { env } from '@/lib/validators/env'
import { getAccessToken, clearGrabFoodTokenCache, isGrabFoodConfigured } from './auth'
import type {
  GrabBatchMenuRecordUpdate,
  GrabCancelCode,
  GrabCancelableResponse,
  GrabListOrdersQuery,
  GrabListOrdersResponse,
  GrabMenuRecordUpdate,
  GrabMenuSyncTrace,
  GrabSelfServeJourneyResponse,
  GrabStoreStatus,
} from './types'

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
  query?: Record<string, string | number | string[] | undefined>
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

  constructor(options?: {
    environment?: GrabFoodEnvironment
    fetchImpl?: typeof fetch
    timeoutMs?: number
  }) {
    this.environment = options?.environment ?? (env.GRABFOOD_ENV as GrabFoodEnvironment) ?? 'mock'
    if (this.environment === 'mock' && process.env.NODE_ENV === 'production') {
      // Fail closed rather than returning synthetic success in production.
      throw new Error('GrabFood mock mode is not allowed in a production process')
    }
    this.fetchImpl = options?.fetchImpl ?? fetch
    this.timeoutMs = options?.timeoutMs ?? env.GRABFOOD_REQUEST_TIMEOUT_MS ?? 8000
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
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item)
      } else if (v !== undefined) {
        url.searchParams.set(k, String(v))
      }
    }

    const token = await getAccessToken(this.fetchImpl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    let res: Response
    try {
      res = await this.fetchImpl(url.toString(), {
        method: opts.method,
        headers: {
          Authorization: 'Bearer ' + token,
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

  /** POST /partner/v1/order/prepare — manual acceptance only. */
  async acceptOrder(orderId: string, toState: 'Accepted' | 'Rejected' = 'Accepted'): Promise<void> {
    await this.request({
      method: 'POST',
      path: '/partner/v1/order/prepare',
      body: { orderID: orderId, toState },
    })
  }

  /** POST /partner/v1/orders/mark — markStatus 1 = ready, 2 = dine-in completed. */
  async markOrderReady(orderId: string, markStatus: 1 | 2 = 1): Promise<void> {
    await this.request({
      method: 'POST',
      path: '/partner/v1/orders/mark',
      body: { orderID: orderId, markStatus },
    })
  }

  /** PUT /partner/v1/order/cancel — Grab requires merchantID + cancelCode. */
  async cancelOrder(orderId: string, merchantId: string, cancelCode: GrabCancelCode): Promise<void> {
    await this.request({
      method: 'PUT',
      path: '/partner/v1/order/cancel',
      body: { orderID: orderId, merchantID: merchantId, cancelCode },
    })
  }

  /** GET /partner/v1/orders — date+page or explicit orderIDs (max 10). */
  async listOrders(params: GrabListOrdersQuery): Promise<GrabListOrdersResponse> {
    const query: GrabRequestOptions['query'] = { merchantID: params.merchantID }
    if (params.orderIDs?.length) {
      query.orderIDs = params.orderIDs.slice(0, 10)
    } else {
      if (params.date) query.date = params.date
      if (params.page !== undefined) query.page = params.page
    }
    return this.request<GrabListOrdersResponse>({
      method: 'GET',
      path: '/partner/v1/orders',
      query,
    })
  }

  /** Fetch every page for a date. Grab caps the window at 30 days. */
  async listAllOrders(
    merchantId: string,
    date: string,
    maxPages = 100
  ): Promise<GrabListOrdersResponse> {
    const orders: NonNullable<GrabListOrdersResponse['orders']> = []
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.listOrders({ merchantID: merchantId, date, page })
      orders.push(...(res.orders ?? []))
      if (!res.more) return { more: false, orders }
    }
    throw new GrabFoodApiError(
      `List Orders did not finish within ${maxPages} pages`,
      0,
      '/partner/v1/orders'
    )
  }

  /** PUT /partner/v1/menu — price/availability of a single item or modifier. */
  async updateMenuRecord(record: GrabMenuRecordUpdate): Promise<void> {
    await this.request({ method: 'PUT', path: '/partner/v1/menu', body: record })
  }

  /** PUT /partner/v1/batch/menu — up to 100 entities per request. */
  async batchUpdateMenuRecords(update: GrabBatchMenuRecordUpdate): Promise<void> {
    await this.request({ method: 'PUT', path: '/partner/v1/batch/menu', body: update })
  }

  /** POST /partner/v1/merchant/menu/notification — trigger a full menu pull. */
  async notifyMenuUpdate(merchantId: string): Promise<void> {
    await this.request({
      method: 'POST',
      path: '/partner/v1/merchant/menu/notification',
      body: { merchantID: merchantId },
    })
  }

  /** GET /partner/v1/merchant/menu/trace — inspect the last menu sync on Grab's side. */
  async getMenuSyncTrace(merchantId: string): Promise<GrabMenuSyncTrace> {
    return this.request<GrabMenuSyncTrace>({
      method: 'GET',
      path: '/partner/v1/merchant/menu/trace',
      query: { merchantID: merchantId },
    })
  }

  /** GET /partner/v1/order/cancelable — eligibility + Grab's cancel reasons. */
  async getOrderCancelable(orderId: string, merchantId: string): Promise<GrabCancelableResponse> {
    return this.request<GrabCancelableResponse>({
      method: 'GET',
      path: '/partner/v1/order/cancelable',
      query: { orderID: orderId, merchantID: merchantId },
    })
  }

  /** PUT /partner/v1/order/readytime — documented field is newOrderReadyTime. */
  async updateReadyTime(orderId: string, newOrderReadyTime: string): Promise<void> {
    await this.request({
      method: 'PUT',
      path: '/partner/v1/order/readytime',
      body: { orderID: orderId, newOrderReadyTime },
    })
  }

  /** PUT /partner/v1/merchant/pause — documented field is isPause (+ duration). */
  async pauseStore(
    merchantId: string,
    isPaused: boolean,
    duration?: '30m' | '1h' | '24h'
  ): Promise<void> {
    await this.request({
      method: 'PUT',
      path: '/partner/v1/merchant/pause',
      body: { merchantID: merchantId, isPause: isPaused, ...(duration ? { duration } : {}) },
    })
  }

  /** GET /partner/v1/merchants/{merchantID}/store/status — open/paused state. */
  async getStoreStatus(merchantId: string): Promise<GrabStoreStatus> {
    return this.request<GrabStoreStatus>({
      method: 'GET',
      path: `/partner/v1/merchants/${encodeURIComponent(merchantId)}/store/status`,
    })
  }

  /** POST /partner/v1/self-serve/activation — returns the merchant activation URL. */
  async createSelfServeJourney(partnerMerchantId: string): Promise<GrabSelfServeJourneyResponse> {
    return this.request<GrabSelfServeJourneyResponse>({
      method: 'POST',
      path: '/partner/v1/self-serve/activation',
      body: { partner: { merchantID: partnerMerchantId } },
    })
  }
}

export function createGrabFoodClient(
  options?: ConstructorParameters<typeof GrabFoodClient>[0]
): GrabFoodClient {
  return new GrabFoodClient(options)
}
