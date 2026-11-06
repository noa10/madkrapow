/**
 * Fail when Next.js silently drops the proxy from the production build.
 *
 * Next resolves proxy.ts from the directory that holds the App Router. This
 * app's router lives in apps/web/src/app, so the proxy must live at
 * apps/web/src/proxy.ts; a file at the project root is compiled in dev but
 * never in a production build.
 *
 * Next 16 runs the proxy on the Node runtime and records it in
 * server/functions-config-manifest.json under "/_middleware". (The legacy
 * server/middleware-manifest.json stays empty by design for Node proxies, so
 * it is not a useful signal.)
 *
 * Run after `npm run build` (the CI Build job does this automatically).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const serverDir = resolve(import.meta.dirname, '../apps/web/.next/server')
const functionsManifestPath = resolve(serverDir, 'functions-config-manifest.json')
// Webpack builds rename the compiled proxy to middleware.js; a Turbopack build
// (if the app ever switches) leaves it as proxy.js. Accept either.
const proxyBundlePath = [resolve(serverDir, 'middleware.js'), resolve(serverDir, 'proxy.js')].find(
  (candidate) => existsSync(candidate)
)

function fail(lines) {
  for (const line of lines) console.error(line)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(functionsManifestPath, 'utf8'))
} catch (error) {
  fail([
    `✗ Cannot read the production functions manifest at ${functionsManifestPath}`,
    `  ${error instanceof Error ? error.message : error}`,
  ])
}

const entry = manifest.functions?.['/_middleware']

if (!entry) {
  fail([
    '✗ The production build contains no proxy/middleware.',
    '  Expected apps/web/src/proxy.ts, next to src/app.',
    `  Manifest: ${functionsManifestPath}`,
  ])
}

if (entry.runtime !== 'nodejs') {
  fail([
    `✗ The production proxy runs on an unexpected runtime: ${entry.runtime}`,
    '  Next 16 proxies run on the Node.js runtime.',
  ])
}

if (!Array.isArray(entry.matchers) || entry.matchers.length === 0) {
  fail([
    '✗ The production proxy has no matchers.',
    '  The route guards would never run.',
  ])
}

// The matcher is the authorization surface: guard paths must match and
// static/asset paths (plus the large-body avatar upload) must not.
const matches = new RegExp(entry.matchers[0].regexp)
const mustMatch = ['/orders', '/checkout', '/admin', '/auth']
const mustSkip = [
  '/_next/static/chunk.js',
  '/_next/image',
  '/favicon.ico',
  '/images/logo.png',
  '/api/customer/avatar',
]
const missed = mustMatch.filter((path) => !matches.test(path))
const leaked = mustSkip.filter((path) => matches.test(path))
if (missed.length > 0 || leaked.length > 0) {
  fail([
    '✗ The production proxy matcher does not match its intended routes.',
    missed.length > 0 ? `  Not matched: ${missed.join(', ')}` : '',
    leaked.length > 0 ? `  Should be skipped: ${leaked.join(', ')}` : '',
  ].filter(Boolean))
}

if (!proxyBundlePath) {
  fail([
    '✗ The functions manifest lists a proxy but its bundle is missing.',
    `  Expected ${resolve(serverDir, 'middleware.js')} or ${resolve(serverDir, 'proxy.js')}`,
  ])
}

// Vercel consumes the NFT trace alongside the webpack bundle. The Turbopack
// proxy.js path does not emit one, so only require it for middleware.js.
if (proxyBundlePath.endsWith('middleware.js') && !existsSync(`${proxyBundlePath}.nft.json`)) {
  fail([
    '✗ The proxy bundle has no NFT trace, which Vercel needs to deploy it.',
    `  Expected ${proxyBundlePath}.nft.json`,
  ])
}

const bundleKb = Math.round(statSync(proxyBundlePath).size / 1024)
console.log(
  `✓ Production proxy present: runtime=${entry.runtime}, ${entry.matchers.length} matcher(s), bundle ${bundleKb} KB`
)
