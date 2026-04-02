import { describe, it, expect } from 'vitest';
import { HubboPosAuthError, HubboPosRateLimitError, HubboPosApiError, HubboPosCircuitOpenError, HubboPosValidationError } from '../types';

describe('HubboPosAuthError', () => {
  it('has correct properties', () => {
    const error = new HubboPosAuthError('Token expired', '{"error":"invalid_token"}');
    expect(error.name).toBe('HubboPosAuthError');
    expect(error.statusCode).toBe(401);
    expect(error.responseBody).toBe('{"error":"invalid_token"}');
    expect(error.message).toBe('Token expired');
  });
});

describe('HubboPosRateLimitError', () => {
  it('has correct properties without retryAfter', () => {
    const error = new HubboPosRateLimitError('Rate limited', '{"error":"rate_limit"}');
    expect(error.name).toBe('HubboPosRateLimitError');
    expect(error.statusCode).toBe(429);
    expect(error.retryAfter).toBeUndefined();
  });

  it('has correct properties with retryAfter', () => {
    const error = new HubboPosRateLimitError('Rate limited', '{"error":"rate_limit"}', 30);
    expect(error.retryAfter).toBe(30);
  });
});

describe('HubboPosApiError', () => {
  it('has correct properties', () => {
    const error = new HubboPosApiError('Server error', 500, '{"error":"internal"}', 'INTERNAL_ERROR');
    expect(error.name).toBe('HubboPosApiError');
    expect(error.statusCode).toBe(500);
    expect(error.errorCode).toBe('INTERNAL_ERROR');
  });

  it('works without errorCode', () => {
    const error = new HubboPosApiError('Bad request', 400, '{"error":"bad_request"}');
    expect(error.errorCode).toBeUndefined();
  });
});

describe('HubboPosCircuitOpenError', () => {
  it('has correct message', () => {
    const error = new HubboPosCircuitOpenError();
    expect(error.name).toBe('HubboPosCircuitOpenError');
    expect(error.message).toContain('circuit breaker is open');
  });
});

describe('HubboPosValidationError', () => {
  it('has correct properties', () => {
    const error = new HubboPosValidationError('Invalid payload', '{"errors":["missing field"]}');
    expect(error.name).toBe('HubboPosValidationError');
    expect(error.statusCode).toBe(422);
    expect(error.responseBody).toBe('{"errors":["missing field"]}');
  });
});
