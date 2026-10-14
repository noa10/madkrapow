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

function handleRequest(req, res) {
  const { method, url } = req
  const apiKey = req.headers['apikey']
  const requestId = req.headers['x-request-id']

  // Consume any request body so the client never sees a stuck connection.
  req.on('data', () => {})

  // Log only values this harness controls (or coarse booleans) — never the
  // request's own strings. Echoing the caller's path/headers would let a crafted
  // request forge log lines (CWE-117), and the `apiKey` header is a credential
  // (CWE-532), so both are reduced to a fixed label / presence flag here. The
  // raw headers are still available to tests and callers via `req.headers`.
  const route = url?.startsWith('/api/merchant/menu')
    ? '/api/merchant/menu'
    : url?.startsWith('/api/merchant/login')
      ? '/api/merchant/login'
      : url?.startsWith('/api/merchant/snoozeMenu')
        ? '/api/merchant/snoozeMenu'
        : '(unmatched)'
  console.log(
    `[mock] ${method === 'GET' ? 'GET' : method === 'POST' ? 'POST' : 'OTHER'} ${route}  ` +
      `apiKey=${apiKey ? 'present' : 'absent'}  ` +
      `X-Request-Id=${requestId ? 'present' : 'absent'}`
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
