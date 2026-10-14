#!/usr/bin/env node
/**
 * Mock alimentsBackend (Hubbo merchant) — local dry-run harness.
 *
 * Serves just enough of the UNOFFICIAL merchant API for the menu-pull route to
 * run end-to-end over real HTTP without credentials or the real backend:
 *   GET /api/merchant/menu  -> FLAT envelope { code: "200", message, menu[], categories[], ... }
 *   POST /api/merchant/login -> { code: "200", body: { apiKey } }  (unused when
 *                                HUBBO_MERCHANT_API_KEY is set, provided for completeness)
 *
 * The menu shape mirrors a REAL captured pull (see
 * apps/web/src/lib/hubbo-merchant/__tests__/fixtures/live-menu-response.json):
 * flat `menu[]`/`categories[]`, numeric ids, RM-decimal prices, item->category
 * linkage via `subCategories[0].id`, and epoch-MS `snoozeTill`. Note the menu
 * payload is NOT wrapped in `body` — only the login endpoint is.
 *
 * It echoes the request `apiKey` / `X-Request-Id` headers it received so you can
 * confirm the real client sent them. Point HUBBO_MERCHANT_BASE_URL here and set
 * any dummy HUBBO_MERCHANT_API_KEY, then call the pull route with dryRun=true.
 *
 * Usage:  node scripts/mock-aliments.mjs [port]     (default port 8787)
 */
import { createServer } from 'node:http'

const PORT = Number(process.argv[2] ?? 8787)

// A small, representative menu matching the live wire format: numeric ids,
// RM-decimal prices (14.5 = RM 14.50), a per-channel (grabfood) price override,
// a zero grabfoodPrice meaning "not on GrabFood", a two-decimal fallback price,
// a snoozed item, and one deliberately broken row (no price) so the mapper's
// skip/warning path is exercised.
//
// Exported so a test can assert this harness keeps matching the real wire
// format — the previous `body`-wrapped shape silently drifted from the live API.
export const MOCK_MENU = {
  code: '200',
  message: 'success',
  apiKey: null,
  merchant: { id: 3173, name: 'Mock Merchant' },
  categories: [
    { id: 31730001, name: 'Set Krapow' },
    { id: 31730004, name: 'Minuman' },
  ],
  menu: [
    {
      id: 31730001,
      name: 'Set Krapow Daging dengan Minuman',
      desc: 'Beef pad ka prao with hot rice and fried egg',
      sku: '',
      price: 14.5,
      grabfoodPrice: 19.3,
      snoozeTill: null,
      subCategories: [{ id: 31730001, name: 'Set Krapow' }],
    },
    {
      id: 31730004,
      name: 'Teh Ais',
      sku: '',
      // No numeric `price` -> exercises the priceInTwoDecimal string fallback.
      priceInTwoDecimal: '3.50',
      grabfoodPrice: 0.0, // 0 => not sold on GrabFood -> null
      snoozeTill: null,
      subCategories: [{ id: 31730004, name: 'Minuman' }],
    },
    {
      id: 31730027,
      name: 'Sold Out Today',
      sku: '',
      price: 9.0,
      grabfoodPrice: 0.0,
      // snoozed until next week (epoch MS, matching the live payload)
      snoozeTill: Date.now() + 7 * 24 * 60 * 60 * 1000,
      subCategories: [{ id: 31730001, name: 'Set Krapow' }],
    },
    {
      id: 31730099,
      name: 'Broken (no price)',
      sku: '',
      subCategories: [{ id: 31730001, name: 'Set Krapow' }],
    },
  ],
}

/**
 * Strip control characters so caller-supplied values cannot forge extra log
 * lines, then bound the length.
 */
function safeLogValue(value) {
  const str = String(value ?? '')
  // eslint-disable-next-line no-control-regex
  const stripped = str.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?')
  return stripped.length > 64 ? `${stripped.slice(0, 61)}...` : stripped
}

/**
 * Log only a fingerprint of a credential. The header name already says it is a
 * key, so echoing a little of it is enough to confirm the client sent one —
 * printing the value itself would leak a secret into logs.
 */
function maskSecret(value) {
  const str = String(value ?? '')
  if (str.length <= 8) return '***'
  return `${str.slice(0, 4)}…${str.slice(-4)}`
}

function handleRequest(req, res) {
  const { method, url } = req
  const apiKey = req.headers['apikey']
  const requestId = req.headers['x-request-id']

  // Consume any request body so the client never sees a stuck connection.
  req.on('data', () => {})

  console.log(
    `[mock] ${safeLogValue(method)} ${safeLogValue(url)}  ` +
      `apiKey=${apiKey ? maskSecret(apiKey) : '(none)'}  ` +
      `X-Request-Id=${safeLogValue(requestId ?? '(none)')}`
  )

  res.setHeader('Content-Type', 'application/json')

  if (method === 'GET' && url?.startsWith('/api/merchant/menu')) {
    res.writeHead(200)
    // FLAT envelope — the menu payload is at the top level, not under `body`.
    res.end(JSON.stringify(MOCK_MENU))
    return
  }

  if (method === 'POST' && url?.startsWith('/api/merchant/login')) {
    res.writeHead(200)
    res.end(JSON.stringify({ code: '200', message: 'success', body: { apiKey: 'mock-login-apiKey' } }))
    return
  }

  if (method === 'POST' && url?.startsWith('/api/merchant/snoozeMenu')) {
    res.writeHead(200)
    res.end(JSON.stringify({ code: '200', message: 'success', body: null }))
    return
  }

  res.writeHead(404)
  res.end(JSON.stringify({ code: '404', message: `mock: no route for ${method} ${url}` }))
}

/** Factory used by tests to start the same mock on an ephemeral port. */
export function createMockAlimentsServer() {
  return createServer(handleRequest)
}

// Only listen when run directly (`node scripts/mock-aliments.mjs`), so the
// module stays importable by tests without binding a port.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  createMockAlimentsServer().listen(PORT, '127.0.0.1', () => {
    console.log(`mock alimentsBackend listening on http://127.0.0.1:${PORT}`)
    console.log(
      'Set HUBBO_MERCHANT_BASE_URL to this URL and any HUBBO_MERCHANT_API_KEY, then call the pull route with {"dryRun":true}.'
    )
  })
}
