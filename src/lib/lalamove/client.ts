import crypto from 'crypto'
import { env } from '@/lib/validators/env'

const LALAMOVE_ENDPOINTS = {
  sandbox: 'https://sandbox-restapi.lalamove.com',
  production: 'https://restapi.lalamove.com',
} as const

const LALAMOVE_COUNTRY = 'MY' as const

type LalamoveEnv = 'sandbox' | 'production'

interface LalamoveAddress {
  street: string
  city: string
  country: LalamoveCountry
  zipcode?: string
}

type LalamoveCountry = 'MY'

interface LalamoveStop {
  location: LalamoveAddress
  contact: {
    name: string
    phone: string
  }
}

interface QuotationRequest {
  scheduleAt?: string
  stops: LalamoveStop[]
  isRouteInfoEnabled?: boolean
}

interface QuotationResponse {
  totalFee: string
  currency: string
  distance: string
  duration: string
  feeDetails?: {
    deliveryFee: string
    tax: string
    insurance: string
    total: string
  }
}

interface PlaceOrderRequest {
  sender: LalamoveStop
  recipient: LalamoveStop
  scheduleAt?: string
  requestTemplate?: {
    serviceType: string
    specialInstructions?: string
  }
}

interface PlaceOrderResponse {
  orderId: string
  status: string
  fee: string
  currency: string
  eta: string
  driver?: {
    name: string
    phone: string
    vehicleType: string
    licensePlate: string
  }
}

export class LalamoveClient {
  private readonly apiKey: string
  private readonly apiSecret: string
  private readonly env: LalamoveEnv
  private readonly baseUrl: string
  private readonly market: string

  constructor() {
    this.apiKey = env.LALAMOVE_API_KEY
    this.apiSecret = env.LALAMOVE_API_SECRET
    this.env = env.LALAMOVE_ENV
    this.baseUrl = LALAMOVE_ENDPOINTS[this.env]
    this.market = LALAMOVE_COUNTRY
  }

  private generateSignature(
    method: string,
    path: string,
    timestamp: string,
    body: string
  ): string {
    const rawSignature = `${method}${path}${body}${timestamp}`
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(rawSignature)
      .digest('hex')
    return signature
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const timestamp = Date.now().toString()
    const bodyString = body ? JSON.stringify(body) : ''
    const signature = this.generateSignature(method, path, timestamp, bodyString)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `hmac ${this.apiKey}:${timestamp}:${signature}`,
      'Market': this.market,
    }

    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      method,
      headers,
      body: bodyString || undefined,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { message?: string; error?: string }
      throw new Error(error.message || error.error || `Lalamove API error: ${response.status}`)
    }

    return response.json()
  }

  async getQuotation(request: QuotationRequest): Promise<QuotationResponse> {
    const path = '/v2/quotations'

    const quotationRequest = {
      scheduleAt: request.scheduleAt,
      stops: request.stops,
      isRouteInfoEnabled: request.isRouteInfoEnabled ?? true,
    }

    return this.request<QuotationResponse>('POST', path, quotationRequest)
  }

  async placeOrder(request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
    const path = '/v2/orders'

    const orderRequest = {
      sender: request.sender,
      recipient: request.recipient,
      scheduleAt: request.scheduleAt,
      requestTemplate: {
        serviceType: request.requestTemplate?.serviceType ?? 'MOTORCYCLE',
        specialInstructions: request.requestTemplate?.specialInstructions ?? '',
      },
    }

    return this.request<PlaceOrderResponse>('POST', path, orderRequest)
  }

  async getOrderStatus(orderId: string): Promise<PlaceOrderResponse> {
    const path = `/v2/orders/${orderId}`
    return this.request<PlaceOrderResponse>('GET', path)
  }

  getEnvironment(): LalamoveEnv {
    return this.env
  }

  isSandbox(): boolean {
    return this.env === 'sandbox'
  }
}

export function createLalamoveClient(): LalamoveClient {
  return new LalamoveClient()
}
