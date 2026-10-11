import { describe, it, expect, afterEach } from 'vitest'
import { startBridge, decodeClaimResponse, printBytes } from './print-bridge.mjs'

const CONFIG = {
  appUrl: 'https://app.test',
  bridgeSecret: 'bridge-secret',
  bridgeToken: 'page-token',
  printerHost: '127.0.0.1',
  printerPort: 9100,
  bridgePort: 0, // ephemeral
  pollMs: 0,
  autoPrint: false,
}

const APP = 'https://app.test'
const JOB = {
  job_id: 'order-1:kitchen_docket',
  order_id: 'order-1',
  type: 'kitchen_docket',
  bytes: Buffer.from([0x1b, 0x40]).toString('base64'),
}

function fakeDeps() {
  const printed = []
  const appFetches = []
  return {
    printed,
    appFetches,
    deps: {
      log: () => {},
      logError: () => {},
      printer: async (bytes) => {
        printed.push(Array.from(bytes))
      },
      fetchImpl: async (url, init) => {
        appFetches.push({ url, init })
        if (url.endsWith('/api/print/jobs/claim')) {
          return new Response(JSON.stringify({ ok: true, jobs: [JOB] }), { status: 200 })
        }
        if (url.endsWith('/api/print/jobs/render')) {
          return new Response(
            JSON.stringify({ ok: true, order_number: 'MK1', type: 'receipt', bytes: JOB.bytes }),
            { status: 200 }
          )
        }
        return new Response('not found', { status: 404 })
      },
    },
  }
}

async function listen(bridge) {
  await new Promise((resolve) => bridge.server.once('listening', resolve))
  const { port } = bridge.server.address()
  return port
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
const cleanups = []

describe('decodeClaimResponse', () => {
  it('maps claim payloads to print tasks and drops malformed jobs', () => {
    const tasks = decodeClaimResponse({
      ok: true,
      jobs: [JOB, { job_id: 'bad', bytes: '' }, null],
    })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ jobId: 'order-1:kitchen_docket', type: 'kitchen_docket' })
    expect(decodeClaimResponse(null)).toEqual([])
  })
})

describe('printBytes', () => {
  it('sends bytes over TCP and resolves on drain', async () => {
    const connections = []
    const socketFactory = (opts, cb) => {
      connections.push(opts)
      const handlers = {}
      const socket = {
        end: (_data, done) => {
          handlers.end?.()
          done()
        },
        setTimeout: () => {},
        on: (event, fn) => {
          handlers[event] = fn
        },
        destroy: () => handlers.error?.(new Error('destroyed')),
      }
      queueMicrotask(cb)
      return socket
    }
    await printBytes(new Uint8Array([1, 2]), CONFIG, socketFactory)
    expect(connections[0]).toMatchObject({ host: '127.0.0.1', port: 9100 })
  })
})

describe('bridge HTTP surface', () => {
  it('health reports printer target and stats', async () => {
    const { deps } = fakeDeps()
    const bridge = startBridge(CONFIG, deps)
    cleanups.push(bridge.stopBridge)
    const port = await listen(bridge)

    const res = await fetch(`http://127.0.0.1:${port}/health`)
    const json = await res.json()
    expect(json).toMatchObject({
      ok: true,
      printer: '127.0.0.1:9100',
      autoPrint: false,
      printedCount: 0,
    })
  })

  it('/print renders via the app and prints the bytes (bridge token auth)', async () => {
    const { deps, printed, appFetches } = fakeDeps()
    const bridge = startBridge(CONFIG, deps)
    cleanups.push(bridge.stopBridge)
    const port = await listen(bridge)

    const denied = await fetch(`http://127.0.0.1:${port}/print`, {
      method: 'POST',
      body: JSON.stringify({ order_id: 'order-1', type: 'receipt' }),
    })
    expect(denied.status).toBe(401)

    const res = await fetch(`http://127.0.0.1:${port}/print`, {
      method: 'POST',
      headers: { authorization: 'Bearer page-token' },
      body: JSON.stringify({ order_id: 'order-1', type: 'receipt' }),
    })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ ok: true, type: 'receipt', order_number: 'MK1' })
    expect(appFetches[0].url).toBe(`${APP}/api/print/jobs/render`)
    expect(appFetches[0].init.body).toContain('"order_id":"order-1"')
    expect(printed).toHaveLength(1)
    expect(bridge.stats().printedCount).toBe(1)
  })

  it('auto-print polls the claim endpoint and prints claimed jobs', async () => {
    const { deps, printed, appFetches } = fakeDeps()
    const bridge = startBridge({ ...CONFIG, pollMs: 0 }, deps)
    cleanups.push(bridge.stopBridge)

    await bridge.pollOnce()

    expect(appFetches[0].url).toBe(`${APP}/api/print/jobs/claim`)
    expect(appFetches[0].init.headers.authorization).toBe('Bearer bridge-secret')
    expect(printed).toHaveLength(1)
  })

  it('requeues failed prints and gives up after 5 attempts', async () => {
    const attempts = []
    const deps = {
      log: () => {},
      logError: () => {},
      printer: async (bytes, config) => {
        attempts.push(config)
        throw new Error('printer offline')
      },
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true, jobs: [JOB] }), { status: 200 }),
    }
    const bridge = startBridge({ ...CONFIG }, deps)
    cleanups.push(bridge.stopBridge)

    await bridge.pollOnce()
    expect(bridge.stats().retrying).toBe(1)

    // 4 more failures exhaust the 5-attempt budget.
    for (let i = 0; i < 4; i++) await bridge.flushRetryQueue()
    expect(bridge.stats().retrying).toBe(0)
    expect(attempts.length).toBeGreaterThanOrEqual(5)
  })

  it('refuses to start without PRINT_BRIDGE_SECRET', () => {
    expect(() => startBridge({ ...CONFIG, bridgeSecret: undefined }, fakeDeps().deps)).toThrow(
      /PRINT_BRIDGE_SECRET is required/
    )
  })
})
