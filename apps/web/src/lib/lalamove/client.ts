import { env } from '@/lib/validators/env'
import { LalamoveTransport, resolveBaseUrl } from './transport'
import type {
  LalamoveQuotationRequest,
  LalamoveQuotationResponse,
  LalamovePlaceOrderRequest,
  LalamoveOrderResponse,
  LalamoveDriverDetails,
  LalamoveCityInfo,
} from './types'

/**
 * High-level Lalamove v3 API client.
 *
 * Composes transport, auth, and type-safe methods for:
 * - Quotation (POST /v3/quotations)
 * - Place Order (POST /v3/orders)
 * - Order Details (GET /v3/orders/{id})
 * - Driver Details (GET /v3/orders/{orderId}/drivers/{driverId})
 * - Cancel Order (DELETE /v3/orders/{id})
 * - City Info (GET /v3/cities)
 */
export class LalamoveClient {
  private readonly transport: LalamoveTransport
  private readonly envMode: 'sandbox' | 'production'

  constructor() {
    this.envMode = env.LALAMOVE_ENV

    const baseUrl = resolveBaseUrl(
      this.envMode,
      env.LALAMOVE_BASE_URL || undefined
    )

    this.transport = new LalamoveTransport({
      apiKey: env.LALAMOVE_API_KEY!,
      apiSecret: env.LALAMOVE_API_SECRET!,
      market: env.LALAMOVE_MARKET || 'MY',
      baseUrl,
    })
  }

  /**
   * Create a quotation.
   *
   * POST /v3/quotations
   * Returns quotation ID, stop IDs, price breakdown, and expiry time.
   */
  async getQuotation(request: LalamoveQuotationRequest): Promise<LalamoveQuotationResponse> {
    // Lalamove v3 requires request bodies wrapped in {data: ...}
    return this.transport.post<LalamoveQuotationResponse>('/v3/quotations', {
      data: {
        serviceType: request.serviceType,
        language: request.language,
        stops: request.stops,
        scheduleAt: request.scheduleAt,
        specialRequests: request.specialRequests,
        item: request.item,
        isRouteOptimized: request.isRouteOptimized,
      },
    })
  }

  /**
   * Place an order from a quotation.
   *
   * POST /v3/orders
   * Requires quotationId and stopIds from a valid (non-expired) quotation.
   */
  async placeOrder(request: LalamovePlaceOrderRequest): Promise<LalamoveOrderResponse> {
    return this.transport.post<LalamoveOrderResponse>('/v3/orders', {
      data: {
        quotationId: request.quotationId,
        sender: request.sender,
        recipients: request.recipients,
        isPODEnabled: request.isPODEnabled ?? true,
        metadata: request.metadata,
      },
    })
  }

  /**
   * Get order details.
   *
   * GET /v3/orders/{orderId}
   */
  async getOrderDetails(orderId: string): Promise<LalamoveOrderResponse> {
    return this.transport.get<LalamoveOrderResponse>(`/v3/orders/${orderId}`)
  }

  /**
   * Get driver details.
   *
   * GET /v3/orders/{orderId}/drivers/{driverId}
   *
   * Returns 403 if called outside the driver details window
   * (before driver is assigned or after order is completed).
   */
  async getDriverDetails(
    orderId: string,
    driverId: string
  ): Promise<LalamoveDriverDetails> {
    return this.transport.get<LalamoveDriverDetails>(
      `/v3/orders/${orderId}/drivers/${driverId}`
    )
  }

  /**
   * Cancel an order.
   *
   * DELETE /v3/orders/{orderId}
   * Only allowed when status is ASSIGNING_DRIVER or ON_GOING < 5 min.
   */
  async cancelOrder(orderId: string): Promise<void> {
    await this.transport.del(`/v3/orders/${orderId}`)
  }

  /**
   * Get city info for Malaysia.
   *
   * GET /v3/cities?countryIso2=MY
   * Returns available cities, service types, and special requests.
   */
  async getCityInfo(): Promise<LalamoveCityInfo[]> {
    const result = await this.transport.get<LalamoveCityInfo[]>(
      '/v3/cities?countryIso2=MY'
    )
    return result
  }

  /**
   * Get the current environment mode.
   */
  getEnvironment(): 'sandbox' | 'production' {
    return this.envMode
  }

  /**
   * Check if running in sandbox mode.
   */
  isSandbox(): boolean {
    return this.envMode === 'sandbox'
  }
}

/**
 * Factory function to create a LalamoveClient instance.
 */
export function createLalamoveClient(): LalamoveClient {
  return new LalamoveClient()
}
