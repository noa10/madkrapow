import { timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/validators/env'

/**
 * Bridge authentication for the print-job endpoints.
 *
 * The bridge presents `Authorization: Bearer <PRINT_BRIDGE_SECRET>`. Two rules
 * matter here:
 *
 * 1. Compare in constant time — a plain `===` leaks the secret's prefix one
 *    byte at a time to anyone who can time the endpoint.
 * 2. Fail closed when the secret is the same value as the browser-exposed
 *    `NEXT_PUBLIC_PRINT_BRIDGE_TOKEN`. That token ships in the client bundle,
 *    so treating it as the bridge secret would let any visitor claim every
 *    pending print job and render any order. Misconfiguration must not become
 *    an authorization bypass.
 */
export function isBridgeRequest(authorizationHeader: string | null): boolean {
  const secret = env.PRINT_BRIDGE_SECRET
  if (!secret) return false

  const publicToken = env.NEXT_PUBLIC_PRINT_BRIDGE_TOKEN
  if (publicToken && publicToken === secret) {
    console.error(
      '[Print] PRINT_BRIDGE_SECRET equals NEXT_PUBLIC_PRINT_BRIDGE_TOKEN; refusing bridge auth. ' +
        'Set PRINT_BRIDGE_SECRET to a separate random value.'
    )
    return false
  }

  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(authorizationHeader ?? '')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
