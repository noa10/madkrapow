/**
 * Billplz API v3 client (sandbox-first).
 *
 * Docs: https://support.billplz.com/api
 *
 * Authentication is HTTP Basic with the Secret Key as the username and an
 * empty password. Amounts are integer cents. The callback authenticity check
 * uses a separate X Signature key: every callback field except `x_signature`
 * is sorted by key (case-insensitive), concatenated as `key + value`, joined
 * with `|`, then HMAC-SHA256 signed.
 *
 * Sandbox and production are separate accounts with separate keys, so the
 * environment switch changes both the base URL and the credentials the caller
 * must configure.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { env } from '@/lib/validators/env'

export const BILLPLZ_SANDBOX_BASE_URL = 'https://www.billplz-sandbox.com/api/v3'
export const BILLPLZ_PRODUCTION_BASE_URL = 'https://www.billplz.com/api/v3'

const REQUEST_TIMEOUT_MS = 15_000

export interface BillplzBill {
  id: string
  collection_id?: string
  paid: boolean | string
  state?: string
  amount: number | string
  paid_amount?: number | string | null
  due_at?: string | null
  email?: string | null
  mobile?: string | null
  name?: string | null
  url?: string
  paid_at?: string | null
  reference_1?: string | null
  reference_2?: string | null
  [key: string]: unknown
}

export interface CreateBillParams {
  email?: string
  mobile?: string
  name: string
  amountCents: number
  description: string
  callbackUrl: string
  redirectUrl: string
  reference1?: string
  reference2?: string
}

export class BillplzNotConfiguredError extends Error {
  constructor(message = 'Billplz is not configured') {
    super(message)
    this.name = 'BillplzNotConfiguredError'
  }
}

export class BillplzApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'BillplzApiError'
    this.status = status
  }
}

/**
 * Billplz is usable only when all three values are present. The X Signature
 * key is required too because an unverifiable callback must never be trusted.
 */
export function isBillplzConfigured(): boolean {
  return Boolean(
    env.BILLPLZ_API_KEY &&
      env.BILLPLZ_COLLECTION_ID &&
      env.BILLPLZ_X_SIGNATURE_KEY,
  )
}

/** The configured collection, used to reject a bill from another collection. */
export function getBillplzCollectionId(): string | undefined {
  return env.BILLPLZ_COLLECTION_ID
}

export function getBillplzBaseUrl(): string {
  const override = env.BILLPLZ_BASE_URL?.trim()
  if (override) return override.replace(/\/+$/, '')

  return env.BILLPLZ_ENV === 'production'
    ? BILLPLZ_PRODUCTION_BASE_URL
    : BILLPLZ_SANDBOX_BASE_URL
}

function requireConfig(): {
  apiKey: string
  collectionId: string
  xSignatureKey: string
} {
  const apiKey = env.BILLPLZ_API_KEY
  const collectionId = env.BILLPLZ_COLLECTION_ID
  const xSignatureKey = env.BILLPLZ_X_SIGNATURE_KEY

  if (!apiKey || !collectionId || !xSignatureKey) {
    throw new BillplzNotConfiguredError()
  }

  return { apiKey, collectionId, xSignatureKey }
}

function authorizationHeader(apiKey: string): string {
  // Billplz Basic auth: secret key as username, empty password. The trailing
  // colon is required, hence `${apiKey}:`.
  return `Basic ${Buffer.from(`${apiKey}:`, 'utf8').toString('base64')}`
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value
}

function buildFormBody(params: CreateBillParams, collectionId: string): URLSearchParams {
  const body = new URLSearchParams({
    collection_id: collectionId,
    name: truncate(params.name, 255),
    amount: String(params.amountCents),
    description: truncate(params.description, 200),
    callback_url: params.callbackUrl,
    redirect_url: params.redirectUrl,
  })

  if (params.email) body.set('email', params.email)
  if (params.mobile) body.set('mobile', params.mobile)
  if (params.reference1) body.set('reference_1', truncate(params.reference1, 120))
  if (params.reference2) body.set('reference_2', truncate(params.reference2, 120))

  return body
}

async function parseJsonResponse<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()

  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    throw new BillplzApiError(
      `Billplz returned a non-JSON response (${context})`,
      response.status,
    )
  }

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof (payload as { error?: unknown }).error === 'object'
        ? JSON.stringify((payload as { error: unknown }).error)
        : `Billplz request failed (${context})`

    throw new BillplzApiError(message, response.status)
  }

  return payload as T
}

function assertBill(payload: BillplzBill, context: string): BillplzBill {
  if (!payload || typeof payload.id !== 'string' || payload.id.length === 0) {
    throw new BillplzApiError(`Billplz response is missing a bill id (${context})`, 502)
  }
  return payload
}

/**
 * Create a bill and return it. The caller redirects the customer to `bill.url`.
 */
export async function createBill(
  params: CreateBillParams,
): Promise<BillplzBill & { url: string }> {
  const { apiKey, collectionId } = requireConfig()

  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error('Billplz amount must be a positive integer in cents')
  }
  if (!params.email && !params.mobile) {
    throw new Error('Billplz requires either an email or a mobile number')
  }
  if (!params.callbackUrl || !params.redirectUrl) {
    throw new Error('Billplz requires callback_url and redirect_url')
  }

  const response = await fetch(`${getBillplzBaseUrl()}/bills`, {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader(apiKey),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: buildFormBody(params, collectionId),
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const bill = assertBill(
    await parseJsonResponse<BillplzBill>(response, 'create bill'),
    'create bill',
  )

  const url = bill.url
  if (typeof url !== 'string' || url.length === 0) {
    throw new BillplzApiError('Billplz response is missing the payment URL', 502)
  }

  return { ...bill, url }
}

/**
 * Fetch a bill from Billplz. Webhooks are only a notification — the paid
 * state and amount must be re-read from the API before money is treated as
 * received.
 */
export async function getBill(billId: string): Promise<BillplzBill> {
  const { apiKey } = requireConfig()

  // Billplz ids are short alphanumeric tokens. Reject anything else before it
  // reaches the URL path; this is the only user-influenced part of the request.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(billId)) {
    throw new Error('Invalid Billplz bill id')
  }

  const response = await fetch(
    `${getBillplzBaseUrl()}/bills/${encodeURIComponent(billId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: authorizationHeader(apiKey),
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  )

  return assertBill(
    await parseJsonResponse<BillplzBill>(response, 'get bill'),
    'get bill',
  )
}

/**
 * Build the signed source string for a Billplz callback.
 *
 * Keys are sorted case-insensitively, `x_signature` is excluded, and empty
 * values contribute only the key name (e.g. `mobile`).
 */
export type BillplzSignatureEntries = Iterable<[string, unknown]>

export function buildBillplzSignatureSource(
  values: BillplzSignatureEntries,
): string {
  return [...values]
    .filter(([key]) => key !== 'x_signature')
    .sort(([a], [b]) => {
      const lowerA = a.toLowerCase()
      const lowerB = b.toLowerCase()
      if (lowerA < lowerB) return -1
      if (lowerA > lowerB) return 1
      return 0
    })
    .map(([key, value]) => `${key}${value ?? ''}`)
    .join('|')
}

export function computeBillplzSignature(
  values: BillplzSignatureEntries,
  xSignatureKey: string,
): string {
  return createHmac('sha256', xSignatureKey)
    .update(buildBillplzSignatureSource(values), 'utf8')
    .digest('hex')
}

/**
 * Verify a Billplz callback signature in constant time.
 *
 * Returns false when the X Signature key is not configured; callers must treat
 * that as a failed verification (fail closed).
 */
export function verifyBillplzSignature(
  values: BillplzSignatureEntries,
  providedSignature: string | null | undefined,
): boolean {
  const xSignatureKey = env.BILLPLZ_X_SIGNATURE_KEY
  if (!xSignatureKey) return false
  if (!providedSignature) return false

  const expected = computeBillplzSignature(values, xSignatureKey)
  const provided = providedSignature.trim().toLowerCase()

  const expectedBuffer = Buffer.from(expected, 'utf8')
  const providedBuffer = Buffer.from(provided, 'utf8')

  if (expectedBuffer.length !== providedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, providedBuffer)
}

/**
 * Normalise a Malaysian phone number to Billplz's expected mobile format
 * (country code, no `+`, spaces, or dashes). Returns undefined when the input
 * cannot be salvaged.
 */
export function normalizeBillplzMobile(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined

  const digits = phone.replace(/\D/g, '')
  if (!digits) return undefined

  const withCountryCode = digits.startsWith('60')
    ? digits
    : digits.startsWith('0')
      ? `60${digits.slice(1)}`
      : digits

  // Malaysian mobile numbers are 601x followed by 8-9 digits. Landlines start
  // with 603/604/... and must not be sent as a Billplz `mobile`; the bill can
  // still be created with the customer's email.
  return /^601\d{8,9}$/.test(withCountryCode) ? withCountryCode : undefined
}
