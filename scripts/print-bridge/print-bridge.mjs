#!/usr/bin/env node
/**
 * Mad Krapow print bridge — runs on the restaurant LAN (POS laptop, mini PC
 * or Raspberry Pi) and relays print jobs to a network thermal printer
 * (raw ESC/POS over TCP 9100). Vercel serverless cannot reach a LAN printer
 * and browsers cannot open raw TCP, so this agent is the delivery path
 * (Hubbo POS prints the same way from its device).
 *
 *   auto-print:  polls {APP_URL}/api/print/jobs/claim every POLL_MS and sends
 *                each claimed job's bytes to the printer (counter + GrabFood
 *                orders; the server claims each job exactly once).
 *   manual:      POST http://127.0.0.1:{BRIDGE_PORT}/print {order_id, type}
 *                from the /pos or admin pages (localhost is exempt from
 *                mixed-content blocking) -> renders via the app API -> prints.
 *
 * Config (env): APP_URL, PRINT_BRIDGE_SECRET, PRINTER_HOST, PRINTER_PORT,
 * BRIDGE_PORT, POLL_MS, BRIDGE_TOKEN (optional: require it on /print).
 *
 * Run: node scripts/print-bridge/print-bridge.mjs
 */

import net from 'node:net'
import http from 'node:http'

const DEFAULTS = {
  appUrl: 'http://localhost:3000',
  printerHost: '192.168.1.100',
  printerPort: 9100,
  bridgePort: 7420,
  pollMs: 4000,
  printTimeoutMs: 8000,
}

/**
 * Send raw bytes to the printer. Resolves when the socket drains; rejects on
 * connect errors or timeouts so the retry queue can pick the job up again.
 */
export function printBytes(bytes, config, socketFactory = (opts, cb) => net.connect(opts, cb)) {
  return new Promise((resolve, reject) => {
    const socket = socketFactory(
      { host: config.printerHost, port: config.printerPort },
      () => {
        socket.end(Buffer.from(bytes), () => {
          resolve()
        })
      }
    )
    socket.setTimeout(config.printTimeoutMs)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`printer timeout (${config.printerHost}:${config.printerPort})`))
    })
    socket.on('error', (err) => {
      socket.destroy()
      reject(err)
    })
  })
}

/** Map a claim response into print tasks. */
export function decodeClaimResponse(payload) {
  if (!payload || payload.ok !== true || !Array.isArray(payload.jobs)) return []
  return payload.jobs
    .filter((job) => job && typeof job.bytes === 'string' && job.bytes.length > 0)
    .map((job) => ({ jobId: job.job_id ?? `${job.order_id}:${job.type}`, type: job.type, bytes: job.bytes }))
}

const PRINT_TYPES = ['kitchen_docket', 'receipt', 'grabfood_ticket']

/**
 * Reduce a claim/job identifier to a strictly-validated, known-shape string
 * before it is ever logged. Job ids come from the app's claim payload, so
 * echoing them verbatim would let a crafted id forge log lines (CWE-117).
 * Anything that does not match the expected `<uuid>:<job-type>` shape (or a
 * plain uuid) is replaced with a constant.
 */
export function safeJobId(value) {
  const str = String(value ?? '')
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?::([a-z_]+))?$/i.exec(str)
  if (!match) return '(unrecognised job)'
  const type = match[2]
  return type && PRINT_TYPES.includes(type) ? `${match[1]}:${type}` : match[1]
}

/**
 * Start the bridge. Returns the running HTTP server and handles for tests.
 * `deps` is injectable: fetchImpl, printer (printBytes), setTimeoutImpl.
 */
export function startBridge(configOverrides = {}, deps = {}) {
  const config = { ...DEFAULTS, ...configOverrides }
  const fetchImpl = deps.fetchImpl ?? fetch
  const printer = deps.printer ?? printBytes
  const log = deps.log ?? ((...args) => console.log('[print-bridge]', ...args))
  const logError = deps.logError ?? ((...args) => console.error('[print-bridge]', ...args))

  if (!config.bridgeSecret) {
    throw new Error('PRINT_BRIDGE_SECRET is required (the app API fails closed without it)')
  }

  const retryQueue = []
  let pollingTimer = null
  let stopped = false
  let lastPrintAt = null
  let printedCount = 0

  async function sendToPrinter(task) {
    const bytes = Buffer.from(task.bytes, 'base64')
    await printer(new Uint8Array(bytes), config)
    lastPrintAt = new Date().toISOString()
    printedCount += 1
    log(`printed ${safeJobId(task.jobId)} (${bytes.length} bytes)`)
  }

  async function withRetry(task) {
    try {
      await sendToPrinter(task)
    } catch (err) {
      task.attempts = (task.attempts ?? 0) + 1
      if (task.attempts >= 5) {
        logError(`giving up on ${safeJobId(task.jobId)} after ${task.attempts} attempts`)
        return
      }
      logError(`print failed for ${safeJobId(task.jobId)} (attempt ${task.attempts}), will retry`)
      retryQueue.push(task)
    }
  }

  async function pollOnce() {
    let payload
    try {
      const res = await fetchImpl(
        `${config.appUrl}/api/print/jobs/claim`,
        { headers: { authorization: `Bearer ${config.bridgeSecret}` } }
      )
      if (!res.ok) {
        logError(`claim failed: HTTP ${res.status}`)
        return
      }
      payload = await res.json()
    } catch (err) {
      logError('claim unreachable (network/config error)')
      return
    }
    const tasks = decodeClaimResponse(payload)
    for (const task of tasks) {
      await withRetry(task)
    }
  }

  async function flushRetryQueue() {
    const pending = retryQueue.splice(0, retryQueue.length)
    for (const task of pending) {
      await withRetry(task)
    }
  }

  const server = http.createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      res.end()
      return
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
      res.end(
        JSON.stringify({
          ok: true,
          printer: `${config.printerHost}:${config.printerPort}`,
          autoPrint: config.autoPrint !== false && !deps.noAutoPrint,
          lastPrintAt,
          printedCount,
          retrying: retryQueue.length,
        })
      )
      return
    }

    if (req.method === 'POST' && req.url === '/print') {
      if (config.bridgeToken) {
        const auth = req.headers.authorization ?? ''
        if (auth !== `Bearer ${config.bridgeToken}`) {
          res.writeHead(401, { 'Content-Type': 'application/json', ...cors })
          res.end(JSON.stringify({ error: 'Invalid bridge token' }))
          return
        }
      }
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', async () => {
        let body
        try {
          body = JSON.parse(raw)
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json', ...cors })
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
          return
        }
        const { order_id: orderId, type = 'receipt' } = body
        if (!orderId) {
          res.writeHead(400, { 'Content-Type': 'application/json', ...cors })
          res.end(JSON.stringify({ error: 'order_id is required' }))
          return
        }
        try {
          const appRes = await fetchImpl(`${config.appUrl}/api/print/jobs/render`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              authorization: `Bearer ${config.bridgeSecret}`,
            },
            body: JSON.stringify({ order_id: orderId, type, reprint: body.reprint ?? true }),
          })
          if (!appRes.ok) {
            const text = await appRes.text().catch(() => '')
            res.writeHead(502, { 'Content-Type': 'application/json', ...cors })
            res.end(JSON.stringify({ error: `render failed: HTTP ${appRes.status}`, detail: text.slice(0, 200) }))
            return
          }
          const rendered = await appRes.json()
          // Manual prints surface printer failures to the page immediately —
          // no silent retry queue (staff sees the error and can retry).
          const bytes = Buffer.from(rendered.bytes, 'base64')
          await printer(new Uint8Array(bytes), config)
          lastPrintAt = new Date().toISOString()
          printedCount += 1
          log(`printed ${safeJobId(`${orderId}:${type}`)} (${bytes.length} bytes)`)
          res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
          res.end(JSON.stringify({ ok: true, type: rendered.type, order_number: rendered.order_number }))
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json', ...cors })
          res.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json', ...cors })
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  server.listen(config.bridgePort, '127.0.0.1')

  function startPolling() {
    if (config.autoPrint === false || deps.noAutoPrint || config.pollMs <= 0) return
    pollingTimer = setInterval(() => {
      if (stopped) return
      void pollOnce().then(flushRetryQueue)
    }, config.pollMs)
  }

  return {
    server,
    config,
    pollOnce,
    flushRetryQueue,
    startPolling,
    stopBridge: () => {
      stopped = true
      if (pollingTimer) clearInterval(pollingTimer)
      return new Promise((resolve) => server.close(resolve))
    },
    stats: () => ({ printedCount, lastPrintAt, retrying: retryQueue.length }),
  }
}

// Auto-start when run directly: node scripts/print-bridge/print-bridge.mjs
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const bridge = startBridge({
    appUrl: process.env.APP_URL || DEFAULTS.appUrl,
    bridgeSecret: process.env.PRINT_BRIDGE_SECRET,
    bridgeToken: process.env.BRIDGE_TOKEN,
    printerHost: process.env.PRINTER_HOST || DEFAULTS.printerHost,
    printerPort: Number(process.env.PRINTER_PORT || DEFAULTS.printerPort),
    bridgePort: Number(process.env.BRIDGE_PORT || DEFAULTS.bridgePort),
    pollMs: Number(process.env.POLL_MS || DEFAULTS.pollMs),
  })
  bridge.startPolling()
  console.log(
    `[print-bridge] listening on 127.0.0.1:${bridge.config.bridgePort}, printer ${bridge.config.printerHost}:${bridge.config.printerPort}, polling ${bridge.config.appUrl} every ${bridge.config.pollMs}ms`
  )
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      void bridge.stopBridge().then(() => process.exit(0))
    })
  }
}
