import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock env: mock mode + no webhook secret => signature verification disabled.
process.env.GRABFOOD_ENV = 'mock'
delete process.env.GRABFOOD_WEBHOOK_SECRET

const serviceClientMock = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => serviceClientMock(),
}))

import { POST } from '../submit-order/route'

type Call = { table: string; op: string; row?: unknown; payload?: unknown }

interface ChainOptions {
  eventInsertError?: { code: string } | null
  channelOrderExisting?: Record<string, unknown> | null
  existingEventRow?: Record<string, unknown> | null
  mappingRows?: unknown[]
  rpcResult?: Record<string, unknown>
  rpcError?: { message: string } | null
}

function buildMockClient(opts: ChainOptions = {}) {
  const calls: Call[] = []
  return {
    calls,
    from(table: string) {
      const state: { filters: Record<string, unknown>; selected: boolean } = {
        filters: {},
        selected: false,
      }
      const builder = {
        select(_cols?: string) {
          state.selected = true
          return builder
        },
        insert(row: unknown) {
          calls.push({ table, op: 'insert', row })
          if (opts.eventInsertError && table === 'integration_events') {
            return {
              select() {
                return {
                  single: async () => ({ data: null, error: opts.eventInsertError }),
                }
              },
            }
          }
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'evt-1' }, error: null }),
              }
            },
          }
        },
        eq(col: string, val: unknown) {
          state.filters[col] = val
          return builder
        },
        not(_col: string, _op: string, _val: unknown) {
          return builder
        },
        update(_patch: unknown) {
          calls.push({ table, op: 'update', row: _patch })
          return builder
        },
        then(resolve: (v: unknown) => void) {
          if (state.selected && table === 'channel_orders') {
            resolve({ data: opts.channelOrderExisting ?? null, error: null })
            return
          }
          resolve({ data: [], error: null })
        },
        // maybeSingle for the channel_orders / integration_events existence checks
        maybeSingle: async () => {
          if (table === 'channel_orders') {
            return { data: opts.channelOrderExisting ?? null, error: null }
          }
          if (table === 'integration_events') {
            return { data: opts.existingEventRow ?? null, error: null }
          }
          return { data: null, error: null }
        },
      }
      if (table === 'channel_products') {
        // select().eq('channel').not(...) resolves to mapping rows
        builder.then = (resolve: (v: { data: unknown; error: null }) => void) => {
          resolve({ data: opts.mappingRows ?? [], error: null })
        }
      }
      return builder
    },
    async rpc(_fn: string, args: { payload: unknown }) {
      calls.push({ table: 'rpc', op: 'import_channel_order', payload: args.payload })
      return { data: opts.rpcResult ?? { status: 'created', order_id: 'order-1', order_number: 'MKTEST1' }, error: opts.rpcError ?? null }
    },
  }
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/integrations/grabfood/webhooks/submit-order', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }) as unknown as Request
}

const VALID_PAYLOAD = {
  orderID: '91646057-CYUWL64UGF5XVA',
  shortOrderNumber: 'GF-659',
  merchantID: 'C36JLBD2PFD3LA',
  paymentType: 'CASHLESS',
  cutlery: false,
  orderTime: '2026-09-28T08:19:00+00:00',
  items: [
    { itemID: 'g1', merchantItemID: 'GF-ITEM-1', name: 'Set Krapow Daging', quantity: 1, price: 1300 },
  ],
  price: { subtotal: 1300, merchantFundPromo: 0 },
}

describe('POST /api/integrations/grabfood/webhooks/submit-order', () => {
  beforeEach(() => {
    serviceClientMock.mockReset()
  })

  it('creates an order through the RPC and acks 200', async () => {
    const client = buildMockClient({
      mappingRows: [
        { external_item_id: 'GF-ITEM-1', menu_item_id: 'menu-1', external_name: 'Set Krapow Daging' },
      ],
    })
    serviceClientMock.mockReturnValue(client)

    const res = await POST(makeRequest(VALID_PAYLOAD) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('created')
    expect(body.order_number).toBe('MKTEST1')

    // integration_events received the raw payload first
    const eventInsert = client.calls.find((c) => c.table === 'integration_events' && c.op === 'insert')
    expect((eventInsert?.row as Record<string, unknown>).external_event_id).toBe(
      '91646057-CYUWL64UGF5XVA'
    )

    // RPC payload carries the canonical order
    const rpcCall = client.calls.find((c) => c.table === 'rpc')
    const payload = (rpcCall?.payload as unknown) as {
      order: { source: string; status: string }
      channelOrder: { external_order_id: string }
      items: unknown[]
    }
    expect(payload.order.source).toBe('grabfood')
    expect(payload.order.status).toBe('paid')
    expect(payload.channelOrder.external_order_id).toBe('91646057-CYUWL64UGF5XVA')
    expect(payload.items.length).toBe(1)
  })

  it('acks duplicates (integration_events unique violation) with 200', async () => {
    const client = buildMockClient({ eventInsertError: { code: '23505' } })
    serviceClientMock.mockReturnValue(client)

    const res = await POST(makeRequest(VALID_PAYLOAD) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('duplicate')
  })

  it('acks already-imported orders with 200 (order-level idempotency)', async () => {
    const client = buildMockClient({
      channelOrderExisting: {
        id: 'co-1',
        order_id: 'order-uuid',
        orders: { order_number: 'MKEARLIER' },
      },
    })
    serviceClientMock.mockReturnValue(client)

    const res = await POST(makeRequest(VALID_PAYLOAD) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('duplicate')
    expect(body.order_number).toBe('MKEARLIER')
  })

  it('reprocesses a previously failed event when Grab retries', async () => {
    const client = buildMockClient({
      eventInsertError: { code: '23505' },
      existingEventRow: { id: 'evt-old', status: 'failed' },
      mappingRows: [
        { external_item_id: 'GF-ITEM-1', menu_item_id: 'menu-1', external_name: 'Set Krapow Daging' },
      ],
    })
    serviceClientMock.mockReturnValue(client)

    const res = await POST(makeRequest(VALID_PAYLOAD) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('created')
    expect(client.calls.some((c) => c.table === 'rpc')).toBe(true)
  })

  it('dedupes a retry whose event was already processed', async () => {
    const client = buildMockClient({
      eventInsertError: { code: '23505' },
      existingEventRow: { id: 'evt-old', status: 'processed' },
    })
    serviceClientMock.mockReturnValue(client)

    const res = await POST(makeRequest(VALID_PAYLOAD) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('duplicate')
    expect(client.calls.some((c) => c.table === 'rpc')).toBe(false)
  })

  it('returns 5xx on unmapped items so Grab retries', async () => {
    const client = buildMockClient({ mappingRows: [] })
    serviceClientMock.mockReturnValue(client)

    const res = await POST(makeRequest(VALID_PAYLOAD) as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Processing failed')
  })

  it('does not let an unmapped item name forge log lines (CWE-117, alert #57)', async () => {
    // The unmapped detail embeds payload-controlled item identifiers
    // (mapper.ts: `unmapped.push(item.merchantItemID ?? ... ?? item.name)`),
    // and the route logs it. A newline here would otherwise forge a log line.
    const client = buildMockClient({ mappingRows: [] })
    serviceClientMock.mockReturnValue(client)

    const errors: string[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '))
    })
    let status: number
    try {
      const hostile = {
        ...VALID_PAYLOAD,
        items: [
          {
            itemID: 'g1',
            merchantItemID: 'GF-ITEM-1\n[GrabFood] FORGED: order accepted, no action needed',
            name: 'Set Krapow Daging',
            quantity: 1,
            price: 1300,
          },
        ],
      }
      status = (await POST(makeRequest(hostile) as never)).status
    } finally {
      spy.mockRestore()
    }

    expect(status).toBe(500)
    // The invariant is "one log line per event", not "the word FORGED is
    // absent": the attacker text may remain as inert content, but it must not
    // start a line of its own and be mistaken for a separate log entry.
    const lines = errors.join('\n').split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('submit-order failed')
    expect(lines[0]).toContain('GF-ITEM-1')
    expect(lines.some((line) => line.startsWith('[GrabFood] FORGED'))).toBe(false)
  })

  it('rejects payloads missing orderID with 400', async () => {
    const res = await POST(makeRequest({ merchantID: 'm' }) as never)
    expect(res.status).toBe(400)
  })

  it('rejects invalid JSON with 400', async () => {
    const res = await POST(makeRequest('not-json') as never)
    expect(res.status).toBe(400)
  })
})
