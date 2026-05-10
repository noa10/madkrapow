import type { LalamoveApiResponse } from './types'
import { LalamoveApiError, LalamoveRateLimitError, LalamoveAuthError } from './types'
import { buildAuthHeaders, type HttpMethod } from './auth'

function sanitizeForLog(value: unknown): string {
  const str = typeof value === 'string' ? value : String(value ?? '')
  return str.replace(/[\r\n]+/g, ' ')
}

export interface LalamoveTransportConfig {
  apiKey: string
  apiSecret: string
  market: string
  baseUrl: string
}

const LALAMOVE_ENDPOINTS = {
  sandbox: 'https://rest.sandbox.lalamove.com',
  production: 'https://rest.lalamove.com',
} as const

export type LalamoveEnv = 'sandbox' | 'production'

/**
 * Resolve the base URL from environment or explicit config.
 */
export function resolveBaseUrl(env: LalamoveEnv, override?: string): string {
  if (override) return override
  return LALAMOVE_ENDPOINTS[env]
}

/**
 * Low-level transport for Lalamove v3 API.
 *
 * Handles:
 * - v3 HMAC-SHA256 authentication headers
 * - Request-ID nonce generation
 * - Response unwrapping (v3 wraps responses in { data: ... })
 * - Error handling with typed exceptions
 * - Retry logic for transient failures
 */
export class LalamoveTransport {
  private readonly config: LalamoveTransportConfig

  constructor(config: LalamoveTransportConfig) {
    this.config = config
  }

  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    retryCount = 0
  ): Promise<T> {
    const bodyString = body ? JSON.stringify(body) : undefined

    // Lalamove v3 auth signature must use the path without query parameters
    const authPath = path.split('?')[0]

    const headers = buildAuthHeaders(
      this.config.apiKey,
      this.config.apiSecret,
      this.config.market,
      method,
      authPath,
      bodyString
    )

    const url = `${this.config.baseUrl}${path}`

    const safePath = sanitizeForLog(path)
    const bodyPreview = bodyString ? `body=${sanitizeForLog(bodyString.slice(0, 200))}` : '(no body)'
    console.log('[Lalamove]', method, safePath, bodyPreview)

    const response = await fetch(url, {
      method,
      headers,
      body: bodyString,
    })

    console.log('[Lalamove]', method, safePath, '→', response.status, sanitizeForLog(response.statusText))

    if (response.ok) {
      const json = (await response.json()) as LalamoveApiResponse<T>
      return json.data
    }

    const errorBody = await response.json().catch(() => ({}))

    console.error('[Lalamove] Error response for', method, safePath, sanitizeForLog(JSON.stringify(errorBody)))

    // Handle specific error codes
    switch (response.status) {
      case 401:
        throw new LalamoveAuthError()

      case 429: {
        // Retry with exponential backoff (max 3 retries)
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000
          await new Promise((r) => setTimeout(r, delay))
          return this.request<T>(method, path, body, retryCount + 1)
        }
        throw new LalamoveRateLimitError()
      }

      default: {
        const message =
          (errorBody as { message?: string }).message ||
          `Lalamove API error: ${response.status}`
        console.error('[Lalamove] Full error body:', sanitizeForLog(JSON.stringify(errorBody)))
        throw new LalamoveApiError(message, response.status, errorBody)
      }
    }
  }

  /**
   * GET request helper.
   */
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  /**
   * POST request helper.
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  /**
   * DELETE request helper.
   */
  async del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }
}

/**
 * Create a LalamoveTransport instance from environment config.
 */
export function createTransport(config: LalamoveTransportConfig): LalamoveTransport {
  return new LalamoveTransport(config)
}
