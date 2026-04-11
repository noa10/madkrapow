import { describe, it, expect } from 'vitest';
import {
  STATUS_MAP_MADKRAPOW_TO_HUBBOPOS,
  STATUS_MAP_HUBBOPOS_TO_MADKRAPOW,
  RETRYABLE_STATUS_CODES,
  PERMANENT_FAILURE_STATUS_CODES,
  QUEUE_ACTIONS,
  QUEUE_STATUSES,
  HEALTH_STATUSES,
  CIRCUIT_STATES,
  HUBBOPOS_ENDPOINTS,
  HUBBOPOS_DEFAULTS,
} from '../constants';

describe('Constants', () => {
  it('has correct API endpoints', () => {
    expect(HUBBOPOS_ENDPOINTS.TOKEN).toBe('/v1/oauth2/token');
    expect(HUBBOPOS_ENDPOINTS.MENUS).toBe('/merchant/pos/v1/menus');
    expect(HUBBOPOS_ENDPOINTS.ORDERS).toBe('/merchant/pos/v1/orders');
    expect(HUBBOPOS_ENDPOINTS.ORDER_CREATE).toBe('/merchant/pos/v1/order');
  });

  it('has correct default values', () => {
    expect(HUBBOPOS_DEFAULTS.SYNC_INTERVAL_MINUTES).toBe(5);
    expect(HUBBOPOS_DEFAULTS.REQUEST_TIMEOUT_MS).toBe(10_000);
    expect(HUBBOPOS_DEFAULTS.MAX_RETRIES).toBe(3);
    expect(HUBBOPOS_DEFAULTS.CIRCUIT_BREAKER_THRESHOLD).toBe(5);
    expect(HUBBOPOS_DEFAULTS.CIRCUIT_BREAKER_RESET_MS).toBe(60_000);
  });

  it('has complete status mappings', () => {
    expect(STATUS_MAP_MADKRAPOW_TO_HUBBOPOS['paid']).toBe('paid');
    expect(STATUS_MAP_MADKRAPOW_TO_HUBBOPOS['accepted']).toBe('accepted');
    expect(STATUS_MAP_MADKRAPOW_TO_HUBBOPOS['preparing']).toBe('preparing');
    expect(STATUS_MAP_MADKRAPOW_TO_HUBBOPOS['ready']).toBe('ready');
    expect(STATUS_MAP_MADKRAPOW_TO_HUBBOPOS['picked_up']).toBe('picked_up');
    expect(STATUS_MAP_MADKRAPOW_TO_HUBBOPOS['delivered']).toBe('delivered');
    expect(STATUS_MAP_MADKRAPOW_TO_HUBBOPOS['cancelled']).toBe('cancelled');
  });

  it('maps HubboPOS completed to MadKrapow delivered', () => {
    expect(STATUS_MAP_HUBBOPOS_TO_MADKRAPOW['completed']).toBe('delivered');
  });

  it('has correct retryable status codes', () => {
    expect(RETRYABLE_STATUS_CODES.has(408)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(429)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(500)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(502)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(503)).toBe(true);
    expect(RETRYABLE_STATUS_CODES.has(504)).toBe(true);
  });

  it('has correct permanent failure status codes', () => {
    expect(PERMANENT_FAILURE_STATUS_CODES.has(400)).toBe(true);
    expect(PERMANENT_FAILURE_STATUS_CODES.has(401)).toBe(true);
    expect(PERMANENT_FAILURE_STATUS_CODES.has(403)).toBe(true);
    expect(PERMANENT_FAILURE_STATUS_CODES.has(404)).toBe(true);
    expect(PERMANENT_FAILURE_STATUS_CODES.has(422)).toBe(true);
  });

  it('has correct queue actions', () => {
    expect(QUEUE_ACTIONS.CREATE_ORDER).toBe('create_order');
    expect(QUEUE_ACTIONS.UPDATE_STATUS).toBe('update_status');
    expect(QUEUE_ACTIONS.CANCEL_ORDER).toBe('cancel_order');
    expect(QUEUE_ACTIONS.REFUND_PAYMENT).toBe('refund_payment');
  });

  it('has correct queue statuses', () => {
    expect(QUEUE_STATUSES.PENDING).toBe('pending');
    expect(QUEUE_STATUSES.PROCESSING).toBe('processing');
    expect(QUEUE_STATUSES.COMPLETED).toBe('completed');
    expect(QUEUE_STATUSES.FAILED_PERMANENT).toBe('failed_permanent');
    expect(QUEUE_STATUSES.FAILED_RETRYABLE).toBe('failed_retryable');
  });

  it('has correct circuit states', () => {
    expect(CIRCUIT_STATES.CLOSED).toBe('closed');
    expect(CIRCUIT_STATES.OPEN).toBe('open');
    expect(CIRCUIT_STATES.HALF_OPEN).toBe('half_open');
  });

  it('has correct health statuses', () => {
    expect(HEALTH_STATUSES.HEALTHY).toBe('healthy');
    expect(HEALTH_STATUSES.DEGRADED).toBe('degraded');
    expect(HEALTH_STATUSES.UNHEALTHY).toBe('unhealthy');
    expect(HEALTH_STATUSES.UNKNOWN).toBe('unknown');
  });
});
