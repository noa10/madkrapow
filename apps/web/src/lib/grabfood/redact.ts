/**
 * PII minimisation + idempotency hashing for Grab callbacks.
 *
 * Only the receiver name is needed to operate the order. Phone numbers,
 * addresses, virtual contact details and coordinates are stripped before the
 * payload is persisted in integration_events / channel_orders / payments raw.
 * The full body still exists in transit only.
 */

import { createHash } from 'crypto'

const REDACTED_KEYS = new Set([
  'phone',
  'phones',
  'address',
  'virtualContact',
  'coordinates',
  'deliveryInstruction',
  'unitNumber',
  'postcode',
  'poiID',
  'poiSource',
])

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function redactGrabPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactGrabPayload(item)) as unknown as T
  }
  if (value && typeof value === 'object') {
    // Object.fromEntries uses CreateDataProperty, so a hostile "__proto__"
    // key becomes an own property instead of mutating the prototype. Keys are
    // also filtered before the write.
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !REDACTED_KEYS.has(key) && !DANGEROUS_KEYS.has(key))
        .map(([key, child]) => [key, redactGrabPayload(child)])
    ) as T
  }
  return value
}

/** Deterministic JSON stringify so identical replays hash identically. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload), 'utf8').digest('hex').slice(0, 32)
}

/** Event key that dedupes exact redeliveries but allows edited orders through. */
export function eventKeyFor(eventType: string, payload: unknown, orderId: string): string {
  return `${orderId}:${eventType}:${payloadHash(payload)}`
}
