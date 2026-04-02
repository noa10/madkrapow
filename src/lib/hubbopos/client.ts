import { HubboPosMenuPayload, HubboPosOrderPayload, HubboPosOrderResponse, HubboPosOrderListResponse, HubboPosOrderQueryParams, HubboPosHealthCheckResult } from './types';
import { hubboposRequest } from './transport';
import { HUBBOPOS_ENDPOINTS } from './constants';
import { env } from '@/lib/validators/env';

export class HubboPosClient {
  private merchantId: string;
  private locationId?: string;

  constructor() {
    const merchantId = env.HUBBOPOS_MERCHANT_ID;
    if (!merchantId) {
      throw new Error('HUBBOPOS_MERCHANT_ID is not configured');
    }
    this.merchantId = merchantId;
    this.locationId = env.HUBBOPOS_LOCATION_ID || undefined;
  }

  async getMenus(): Promise<HubboPosMenuPayload> {
    const params = new URLSearchParams({ merchant_id: this.merchantId });
    if (this.locationId) params.set('location_id', this.locationId);

    return hubboposRequest<HubboPosMenuPayload>({
      method: 'GET',
      path: `${HUBBOPOS_ENDPOINTS.MENUS}?${params.toString()}`,
    });
  }

  async getOrders(params?: Partial<HubboPosOrderQueryParams>): Promise<HubboPosOrderListResponse> {
    const queryParams = new URLSearchParams({ merchant_id: this.merchantId });
    if (this.locationId) queryParams.set('location_id', this.locationId);
    if (params?.time_after) queryParams.set('time_after', params.time_after);
    if (params?.time_before) queryParams.set('time_before', params.time_before);
    if (params?.limit) queryParams.set('limit', String(params.limit));
    if (params?.offset) queryParams.set('offset', String(params.offset));

    return hubboposRequest<HubboPosOrderListResponse>({
      method: 'GET',
      path: `${HUBBOPOS_ENDPOINTS.ORDERS}?${queryParams.toString()}`,
    });
  }

  async createOrder(order: HubboPosOrderPayload): Promise<HubboPosOrderResponse> {
    const payload = {
      ...order,
      merchant_id: this.merchantId,
      location_id: this.locationId || order.location_id,
    };

    return hubboposRequest<HubboPosOrderResponse>({
      method: 'POST',
      path: HUBBOPOS_ENDPOINTS.ORDER_CREATE,
      body: payload as Record<string, unknown>,
    });
  }

  async testConnection(): Promise<HubboPosHealthCheckResult> {
    try {
      await this.getMenus();
      return {
        status: 'healthy',
        connected: true,
        merchant_id: this.merchantId,
        location_id: this.locationId || null,
        last_checked_at: new Date().toISOString(),
        error: null,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        merchant_id: this.merchantId,
        location_id: this.locationId || null,
        last_checked_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

let clientInstance: HubboPosClient | null = null;

export function createHubboPosClient(): HubboPosClient {
  if (!clientInstance) {
    clientInstance = new HubboPosClient();
  }
  return clientInstance;
}

export function resetHubboPosClient(): void {
  clientInstance = null;
}
