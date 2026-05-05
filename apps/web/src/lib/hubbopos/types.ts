// ============================================
// HubboPOS API Types
// ============================================

export interface HubboPosTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// ============================================
// HubboPOS Menu Types
// ============================================

export interface HubboPosCategory {
  id: string;
  name: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  items?: HubboPosMenuItem[];
}

export interface HubboPosModifier {
  id: string;
  name: string;
  price_delta?: number;
  is_default?: boolean;
  is_available?: boolean;
  sort_order?: number;
}

export interface HubboPosModifierGroup {
  id: string;
  name: string;
  description?: string;
  min_selections?: number;
  max_selections?: number;
  sort_order?: number;
  modifiers?: HubboPosModifier[];
}

export interface HubboPosMenuItem {
  id: string;
  name: string;
  description?: string;
  price?: number;
  sku?: string;
  category_id?: string;
  image_url?: string;
  is_available?: boolean;
  sort_order?: number;
  modifier_groups?: HubboPosModifierGroup[];
}

export interface HubboPosMenuPayload {
  merchant_id: string;
  location_id?: string;
  categories: HubboPosCategory[];
  items?: HubboPosMenuItem[];
  modifier_groups?: HubboPosModifierGroup[];
  synced_at?: string;
}

// ============================================
// HubboPOS Order Types
// ============================================

export type HubboPosOrderStatus =
  | 'pending'
  | 'paid'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export interface HubboPosOrderItem {
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  notes?: string;
  modifiers?: HubboPosOrderModifier[];
}

export interface HubboPosOrderModifier {
  modifier_id: string;
  modifier_name: string;
  price_delta: number;
}

export interface HubboPosOrderPayload {
  trans_id: string;
  invoice_no: string;
  merchant_id: string;
  location_id?: string;
  order_time: string;
  status: HubboPosOrderStatus;
  subtotal: number;
  delivery_fee?: number;
  total: number;
  customer_name?: string;
  customer_phone?: string;
  order_type?: 'delivery' | 'self_pickup';
  scheduled_time?: string;
  items: HubboPosOrderItem[];
  payment_method?: string;
  notes?: string;
  include_cutlery?: boolean;
}

export interface HubboPosOrderResponse {
  trans_id: string;
  invoice_no: string;
  hubbo_order_id?: string;
  status: HubboPosOrderStatus;
  created_at: string;
}

export interface HubboPosOrderQueryParams {
  merchant_id: string;
  location_id?: string;
  time_after?: string;
  time_before?: string;
  limit?: number;
  offset?: number;
}

export interface HubboPosOrderListResponse {
  orders: HubboPosOrderResponse[];
  total?: number;
  has_more?: boolean;
}

// ============================================
// HubboPOS API Response Wrapper
// ============================================

export interface HubboPosApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================
// HubboPOS Sync Queue Types
// ============================================

export type HubboPosSyncQueueAction =
  | 'create_order'
  | 'update_status'
  | 'cancel_order'
  | 'refund_payment';

export type HubboPosSyncQueueStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed_permanent'
  | 'failed_retryable';

export interface HubboPosSyncQueueRecord {
  id: string;
  order_id: string;
  action: HubboPosSyncQueueAction;
  payload: Record<string, unknown>;
  status: HubboPosSyncQueueStatus;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// HubboPOS API Log Types
// ============================================

export type HubboPosApiDirection = 'outbound' | 'inbound';

export interface HubboPosApiLogEntry {
  id: string;
  direction: HubboPosApiDirection;
  endpoint: string;
  method: string;
  request_headers: Record<string, unknown> | null;
  request_body: Record<string, unknown> | null;
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  duration_ms: number | null;
  success: boolean | null;
  error_message: string | null;
  created_at: string;
}

// ============================================
// HubboPOS Sync Run Types
// ============================================

export type HubboPosSyncRunType = 'scheduled' | 'manual' | 'recovery';
export type HubboPosSyncRunStatus = 'running' | 'completed' | 'failed';

export interface HubboPosSyncRun {
  id: string;
  run_type: HubboPosSyncRunType;
  started_at: string;
  completed_at: string | null;
  status: HubboPosSyncRunStatus;
  catalog_synced: boolean;
  orders_pulled: number;
  orders_pushed: number;
  queue_flushed: number;
  queue_failed: number;
  reconciliation_snapshot: Record<string, unknown> | null;
  error_message: string | null;
  triggered_by: string;
}

// ============================================
// HubboPOS Circuit Breaker Types
// ============================================

export type HubboPosCircuitState = 'closed' | 'open' | 'half_open';

export interface HubboPosCircuitBreakerState {
  state: HubboPosCircuitState;
  failure_count: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  opened_at: string | null;
}

// ============================================
// HubboPOS Health Status Types
// ============================================

export type HubboPosHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HubboPosHealthCheckResult {
  status: HubboPosHealthStatus;
  connected: boolean;
  merchant_id: string | null;
  location_id: string | null;
  last_checked_at: string;
  error: string | null;
}

// ============================================
// Custom Error Classes
// ============================================

export class HubboPosAuthError extends Error {
  public readonly statusCode = 401;
  public readonly responseBody: string;

  constructor(message: string, responseBody: string) {
    super(message);
    this.name = 'HubboPosAuthError';
    this.responseBody = responseBody;
  }
}

export class HubboPosRateLimitError extends Error {
  public readonly statusCode = 429;
  public readonly retryAfter?: number;
  public readonly responseBody: string;

  constructor(message: string, responseBody: string, retryAfter?: number) {
    super(message);
    this.name = 'HubboPosRateLimitError';
    this.responseBody = responseBody;
    this.retryAfter = retryAfter;
  }
}

export class HubboPosApiError extends Error {
  public readonly statusCode: number;
  public readonly responseBody: string;
  public readonly errorCode?: string;

  constructor(message: string, statusCode: number, responseBody: string, errorCode?: string) {
    super(message);
    this.name = 'HubboPosApiError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.errorCode = errorCode;
  }
}

export class HubboPosCircuitOpenError extends Error {
  constructor() {
    super('HubboPOS circuit breaker is open — requests are being short-circuited');
    this.name = 'HubboPosCircuitOpenError';
  }
}

export class HubboPosValidationError extends Error {
  public readonly statusCode = 422;
  public readonly responseBody: string;

  constructor(message: string, responseBody: string) {
    super(message);
    this.name = 'HubboPosValidationError';
    this.responseBody = responseBody;
  }
}
