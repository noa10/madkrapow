import { env } from '@/lib/validators/env';
import { getAccessToken } from './auth';
import {
  HubboPosApiError,
  HubboPosAuthError,
  HubboPosRateLimitError,
  HubboPosValidationError,
  HubboPosCircuitOpenError,
} from './types';
import { RETRYABLE_STATUS_CODES, PERMANENT_FAILURE_STATUS_CODES, HUBBOPOS_DEFAULTS } from './constants';
import { checkCircuit, recordSuccess, recordFailure } from './circuit-breaker';

interface RequestOptions {
  method: string;
  path: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

interface MaskedLogEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  maskedBody?: string;
  maskedResponse?: string;
}

function maskSensitive(value: string): string {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function maskRequestBody(body: Record<string, unknown> | undefined): string | undefined {
  if (!body) return undefined;
  const masked = { ...body };
  if ('client_secret' in masked) masked.client_secret = '****';
  if ('access_token' in masked) masked.access_token = '****';
  if ('customer_phone' in masked && typeof masked.customer_phone === 'string') {
    masked.customer_phone = maskSensitive(masked.customer_phone);
  }
  return JSON.stringify(masked);
}

function maskResponseBody(body: unknown): string | undefined {
  if (!body) return undefined;
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  if (str.length > 500) return `${str.slice(0, 500)}...`;
  return str;
}

function logRequest(entry: MaskedLogEntry): void {
  const level = entry.status >= 500 ? 'error' : entry.status >= 400 ? 'warn' : 'info';
  const prefix = `[HubboPOS]`;
  const msg = `${prefix} ${entry.method} ${entry.path} -> ${entry.status} (${entry.durationMs}ms)`;

  if (level === 'error') {
    console.error(msg, entry.maskedBody, entry.maskedResponse);
  } else if (level === 'warn') {
    console.warn(msg, entry.maskedBody, entry.maskedResponse);
  } else {
    console.log(msg);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function hubboposRequest<T>(options: RequestOptions): Promise<T> {
  checkCircuit();

  const baseUrl = env.HUBBOPOS_API_BASE_URL;
  const timeoutMs = env.HUBBOPOS_REQUEST_TIMEOUT_MS || HUBBOPOS_DEFAULTS.REQUEST_TIMEOUT_MS;
  const maxRetries = env.HUBBOPOS_MAX_RETRIES ?? HUBBOPOS_DEFAULTS.MAX_RETRIES;
  const baseDelayMs = HUBBOPOS_DEFAULTS.RETRY_BASE_DELAY_MS;

  const url = `${baseUrl}${options.path}`;
  const accessToken = await getAccessToken();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      };

      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });

      const durationMs = Date.now() - startTime;
      const maskedBody = maskRequestBody(options.body);

      if (response.ok) {
        const data = (await response.json()) as T;
        recordSuccess();
        logRequest({
          method: options.method,
          path: options.path,
          status: response.status,
          durationMs,
          maskedBody,
          maskedResponse: maskResponseBody(data),
        });
        return data;
      }

      const errorBody = await response.text();

      if (response.status === 401) {
        clearTokenCache();
        recordFailure();
        throw new HubboPosAuthError(`Authentication failed: ${response.status}`, errorBody);
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : baseDelayMs * Math.pow(2, attempt);
        recordFailure();
        logRequest({
          method: options.method,
          path: options.path,
          status: response.status,
          durationMs,
          maskedBody,
          maskedResponse: errorBody,
        });
        if (attempt < maxRetries) {
          await sleep(delay);
          continue;
        }
        throw new HubboPosRateLimitError(`Rate limited: ${response.status}`, errorBody, retryAfter ? parseInt(retryAfter) : undefined);
      }

      if (response.status === 422) {
        recordFailure();
        throw new HubboPosValidationError(`Validation failed: ${response.status}`, errorBody);
      }

      if (PERMANENT_FAILURE_STATUS_CODES.has(response.status)) {
        recordFailure();
        throw new HubboPosApiError(
          `HubboPOS API error: ${response.status}`,
          response.status,
          errorBody
        );
      }

      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logRequest({
          method: options.method,
          path: options.path,
          status: response.status,
          durationMs,
          maskedBody,
          maskedResponse: errorBody,
        });
        if (attempt < maxRetries) {
          await sleep(delay);
          continue;
        }
      }

      recordFailure();
      throw new HubboPosApiError(
        `HubboPOS API error: ${response.status}`,
        response.status,
        errorBody
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError instanceof HubboPosCircuitOpenError) {
        throw lastError;
      }

      if (lastError instanceof HubboPosAuthError || lastError instanceof HubboPosValidationError) {
        throw lastError;
      }

      if (lastError instanceof HubboPosRateLimitError) {
        throw lastError;
      }

      if (lastError instanceof HubboPosApiError && PERMANENT_FAILURE_STATUS_CODES.has(lastError.statusCode)) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      recordFailure();
      throw lastError;
    }
  }

  throw lastError || new Error('HubboPOS request failed after all retries');
}

export function clearTokenCache(): void {
  const { clearTokenCache: authClear } = require('./auth');
  authClear();
}
