import crypto from 'crypto'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/**
 * Generate HMAC-SHA256 signature for Lalamove v3 API.
 *
 * v3 format: `{timestamp}\r\n{method}\r\n{path}\r\n\r\n{body}`
 * For GET requests (no body): `{timestamp}\r\n{method}\r\n{path}\r\n\r\n`
 */
export function generateSignature(
  method: HttpMethod,
  path: string,
  timestamp: string,
  body: string,
  secret: string
): string {
  const raw = body
    ? `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`
    : `${timestamp}\r\n${method}\r\n${path}\r\n\r\n`

  return crypto.createHmac('sha256', secret).update(raw).digest('hex')
}

/**
 * Build authentication headers for Lalamove v3 API.
 *
 * Returns:
 * - Authorization: hmac {apiKey}:{timestamp}:{signature}
 * - Market: {market}
 * - Request-ID: {uuid}
 * - Content-Type: application/json
 */
export function buildAuthHeaders(
  apiKey: string,
  apiSecret: string,
  market: string,
  method: HttpMethod,
  path: string,
  body?: string
): Record<string, string> {
  const timestamp = Date.now().toString()
  const signature = generateSignature(method, path, timestamp, body ?? '', apiSecret)

  return {
    'Authorization': `hmac ${apiKey}:${timestamp}:${signature}`,
    'Market': market,
    'Request-ID': crypto.randomUUID(),
    'Content-Type': 'application/json',
  }
}

/**
 * Verify a webhook signature from Lalamove.
 *
 * Webhooks use HMAC-SHA256 of the raw body string, hex-encoded.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  )
}
