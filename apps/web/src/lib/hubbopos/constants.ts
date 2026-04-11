// ============================================
// HubboPOS API Constants
// ============================================

export const HUBBOPOS_API_VERSION = 'v1';
export const HUBBOPOS_DEFAULT_SCOPE = 'mexpos.partner_api';

// API Endpoints (relative to HUBBOPOS_API_BASE_URL)
export const HUBBOPOS_ENDPOINTS = {
  TOKEN: '/v1/oauth2/token',
  MENUS: '/merchant/pos/v1/menus',
  ORDERS: '/merchant/pos/v1/orders',
  ORDER_CREATE: '/merchant/pos/v1/order',
} as const;

// HTTP Methods
export const HUBBOPOS_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
} as const;

// Default configuration values
export const HUBBOPOS_DEFAULTS = {
  SYNC_INTERVAL_MINUTES: 5,
  REQUEST_TIMEOUT_MS: 10_000,
  MAX_RETRIES: 3,
  RETRY_BASE_DELAY_MS: 1_000,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_RESET_MS: 60_000,
  QUEUE_MAX_RETRIES: 3,
  QUEUE_BATCH_SIZE: 10,
  ORDER_POLL_WINDOW_MINUTES: 30,
  RECONCILIATION_LOOKBACK_HOURS: 24,
} as const;

// HubboPOS order status values (confirmed from public docs)
export const HUBBOPOS_ORDER_STATUSES = [
  'pending',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'completed',
  'cancelled',
] as const;

// MadKrapow order status values
export const MADKRAPOW_ORDER_STATUSES = [
  'pending',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
] as const;

// Status mapping: MadKrapow -> HubboPOS
export const STATUS_MAP_MADKRAPOW_TO_HUBBOPOS: Record<string, string> = {
  pending: 'pending',
  paid: 'paid',
  accepted: 'accepted',
  preparing: 'preparing',
  ready: 'ready',
  picked_up: 'picked_up',
  delivered: 'delivered',
  cancelled: 'cancelled',
};

// Status mapping: HubboPOS -> MadKrapow
export const STATUS_MAP_HUBBOPOS_TO_MADKRAPOW: Record<string, string> = {
  pending: 'pending',
  paid: 'paid',
  accepted: 'accepted',
  preparing: 'preparing',
  ready: 'ready',
  picked_up: 'picked_up',
  delivered: 'delivered',
  completed: 'delivered',
  cancelled: 'cancelled',
};

// Retryable HTTP status codes
export const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// Permanent failure HTTP status codes (do not retry)
export const PERMANENT_FAILURE_STATUS_CODES = new Set([400, 401, 403, 404, 422]);

// Sync queue action types
export const QUEUE_ACTIONS = {
  CREATE_ORDER: 'create_order',
  UPDATE_STATUS: 'update_status',
  CANCEL_ORDER: 'cancel_order',
  REFUND_PAYMENT: 'refund_payment',
} as const;

// Sync queue status values
export const QUEUE_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED_PERMANENT: 'failed_permanent',
  FAILED_RETRYABLE: 'failed_retryable',
} as const;

// Health status values
export const HEALTH_STATUSES = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
} as const;

// Circuit breaker states
export const CIRCUIT_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
} as const;

// HubboPOS source markers
export const SOURCE_HUBBOPOS = 'hubbopos';
export const SOURCE_LOCAL = 'local';
