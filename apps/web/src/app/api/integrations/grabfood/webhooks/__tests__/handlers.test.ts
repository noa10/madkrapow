import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleOrderState, handleSubmitOrder, replayGrabEvent } from '../handlers'

interface Call {
  table: string
  op: string
  row?: unknown
  patch?: unknown
}

class FakeDb {
  calls: Call[] = []
  channelOrder: Record<string, unknown> | null = null
  mappingRows: Array<Record<string, unknown>> = []
  rpcResult: Record<string, unknown> = {
    status: 'created',
    order_id: 'order-1',
    order_number: 'MK1',
  }
  orderStatus = 'preparing'
  eventInsertError: { code?: string } | null = null
  existingEvent: Record<string, unknown> | null = null
  claimWon = true
  claimFilters: Array<[string, unknown]> = []

  from(table: string) {
    return new Builder(this, table)
  }

  async rpc(fn: string, args: unknown) {
    this.calls.push({ table: 'rpc', op: fn, row: args })
    return { data: this.rpcResult, error: null }
  }
}

class Builder {
  private op = 'select'
  private row: unknown
  private patch: unknown
  private selected = false

  constructor(
    private readonly db: FakeDb,
    private readonly table: string
  ) {}

  select() {
    this.selected = true
    return this
  }

  insert(row: unknown) {
    this.op = 'insert'
    this.row = row
    return this
  }

  update(patch: unknown) {
    this.op = 'update'
    this.patch = patch
    return this
  }

  eq(key: string, value: unknown) {
    if (this.table === 'integration_events' && this.op === 'update') this.db.claimFilters.push([key, value])
    return this
  }

  is(key: string, value: unknown) {
    return this.eq(key, value)
  }

  not() {
    return this
  }

  limit() {
    return this
  }

  async maybeSingle() {
    if (this.table === 'channel_orders') {
      return { data: this.db.channelOrder, error: null }
    }
    if (this.table === 'integration_events') {
      if (this.op === 'update') return { data: this.db.claimWon ? { id: 'evt-old' } : null, error: null }
      return { data: this.db.existingEvent, error: null }
    }
    return { data: null, error: null }
  }

  async single() {
    if (this.table === 'integration_events' && this.op === 'insert') {
      if (this.db.eventInsertError) {
        return { data: null, error: this.db.eventInsertError }
      }
      return { data: { id: 'evt-1' }, error: null }
    }
    return { data: null, error: null }
  }

  then(resolve: (value: { data: unknown; error: unknown }) => void) {
    this.db.calls.push({ table: this.table, op: this.op, row: this.row, patch: this.patch })
    if (this.table === 'channel_products' && this.op === 'select') {
      resolve({ data: this.db.mappingRows, error: null })
      return
    }
    if (this.table === 'orders' && this.op === 'update') {
      resolve({ data: [{ id: 'order-1', status: this.db.orderStatus }], error: null })
      return
    }
    resolve({ data: null, error: null })
  }
}

const PAYLOAD = {
  orderID: '91646057-CYUWL64UGF5XVA',
  shortOrderNumber: 'GF-659',
  merchantID: '1-C36JLBD2PFD3LA',
  paymentType: 'CASHLESS' as const,
  cutlery: false,
  orderTime: '2026-09-28T08:19:00+00:00',
  featureFlags: { orderAcceptedType: 'AUTO' as const, orderType: 'DeliveredByGrab' },
  items: [{ id: 'GF-ITEM-1', quantity: 1, price: 1300 }],
  price: { subtotal: 1300, merchantFundPromo: 0 },
}

function db(): FakeDb {
  const fake = new FakeDb()
  fake.mappingRows = [
    { external_item_id: 'GF-ITEM-1', menu_item_id: '11111111-1111-4111-8111-111111111111', external_name: 'Set Krapow' },
  ]
  return fake
}

describe('handleSubmitOrder', () => {
  it('creates the order through apply_channel_order and does not accept in auto mode', async () => {
    const fake = db()
    const result = await handleSubmitOrder(fake as unknown as SupabaseClient, PAYLOAD, null, 'key-1')

    expect(result).toMatchObject({ status: 'created', order_id: 'order-1', order_number: 'MK1' })
    const rpc = fake.calls.find((call) => call.table === 'rpc')
    const payload = (rpc?.row as { payload: Record<string, unknown> }).payload
    expect(payload.isEdit).toBe(false)
    expect((payload.items as unknown[]).length).toBe(1)
    expect((payload.order as { source: string }).source).toBe('grabfood')
    // redacted raw payload carries no receiver PII
    expect(payload.payment).toMatchObject({ method: 'grabfood', status: 'succeeded' })
  })

  it('retains an edit for reconciliation when no authoritative revision is available', async () => {
    const fake = db()
    fake.channelOrder = { id: 'co-1', order_id: 'order-1', orders: { order_number: 'MKOLD' } }
    const result = await handleSubmitOrder(
      fake as unknown as SupabaseClient,
      { ...PAYLOAD, featureFlags: { ...PAYLOAD.featureFlags, isMexEditOrder: true } },
      null,
      'key-edit'
    )
    expect(result).toMatchObject({ status: 'error', detail: 'edit requires authoritative reconciliation' })
    expect(fake.calls.some((call) => call.table === 'rpc')).toBe(false)
    expect(fake.calls.find((call) => call.table === 'integration_events' && call.op === 'update')?.patch)
      .toMatchObject({ status: 'failed' })
  })

  it('dedupes a non-edit repeat without calling the RPC', async () => {
    const fake = db()
    fake.channelOrder = { id: 'co-1', order_id: 'order-1', orders: { order_number: 'MKOLD' } }

    const result = await handleSubmitOrder(fake as unknown as SupabaseClient, PAYLOAD, null, 'key-2')

    expect(result.status).toBe('duplicate')
    expect(fake.calls.some((call) => call.table === 'rpc')).toBe(false)
  })

  it('marks an unmapped delivery failed and returns unmapped', async () => {
    const fake = db()
    fake.mappingRows = []

    const result = await handleSubmitOrder(fake as unknown as SupabaseClient, PAYLOAD, null, 'key-3')

    expect(result.status).toBe('unmapped')
    expect(result.detail).toContain('GF-ITEM-1')
    const failed = fake.calls.find(
      (call) => call.table === 'integration_events' && call.op === 'update'
    )
    expect(failed?.patch).toMatchObject({ status: 'failed' })
  })

  it('does not acknowledge an exhausted unprocessed delivery', async () => {
    const fake = db()
    fake.eventInsertError = { code: '23505' }
    fake.existingEvent = { id: 'evt-old', status: 'failed', attempts: 6, locked_until: null, next_attempt_at: null }
    expect(await handleSubmitOrder(fake as unknown as SupabaseClient, PAYLOAD, null, 'key')).toMatchObject({ status: 'error' })
  })

  it('does not treat a previously processed edit hash as proof of a duplicate', async () => {
    const fake = db()
    fake.eventInsertError = { code: '23505' }
    fake.existingEvent = { id: 'evt-old', status: 'processed', attempts: 1, locked_until: null, next_attempt_at: null }
    const payload = { ...PAYLOAD, featureFlags: { ...PAYLOAD.featureFlags, isMexEditOrder: true } }
    expect(await handleSubmitOrder(fake as unknown as SupabaseClient, payload, null, 'key')).toMatchObject({ status: 'error' })
  })

  it('does not process when the conditional lease claim loses a race', async () => {
    const fake = db()
    fake.eventInsertError = { code: '23505' }
    fake.existingEvent = { id: 'evt-old', status: 'failed', attempts: 2, locked_until: null, next_attempt_at: '2020-01-01T00:00:00Z' }
    fake.claimWon = false
    expect(await handleSubmitOrder(fake as unknown as SupabaseClient, PAYLOAD, null, 'key')).toMatchObject({ status: 'busy' })
    expect(fake.calls.some((call) => call.table === 'rpc')).toBe(false)
    expect(fake.claimFilters).toEqual(expect.arrayContaining([
      ['status', 'failed'], ['attempts', 2], ['locked_until', null], ['next_attempt_at', '2020-01-01T00:00:00Z'],
    ]))
  })

  it('returns busy when another worker holds the event lease', async () => {
    const fake = db()
    fake.eventInsertError = { code: '23505' }
    fake.existingEvent = {
      id: 'evt-old',
      status: 'received',
      attempts: 1,
      locked_until: new Date(Date.now() + 30_000).toISOString(),
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    }

    const result = await handleSubmitOrder(fake as unknown as SupabaseClient, PAYLOAD, null, 'key-4')
    expect(result.status).toBe('busy')
  })
})

describe('replayGrabEvent', () => {
  it('does not replay after another worker wins the lease', async () => {
    const fake = db()
    fake.existingEvent = { id: 'evt-old', status: 'failed', attempts: 2, locked_until: null, next_attempt_at: '2020-01-01T00:00:00Z' }
    fake.claimWon = false
    const result = await replayGrabEvent(fake as unknown as SupabaseClient, {
      id: 'evt-old', event_type: 'submit_order', payload: PAYLOAD, attempts: 2,
    })
    expect(result.status).toBe('busy')
    expect(fake.calls.some((call) => call.table === 'rpc')).toBe(false)
    expect(fake.claimFilters).toEqual(expect.arrayContaining([['status', 'failed'], ['attempts', 2]]))
  })
})

describe('handleOrderState', () => {
  it('keeps an unknown order retryable instead of acknowledging it', async () => {
    const fake = db()
    fake.channelOrder = null

    const result = await handleOrderState(
      fake as unknown as SupabaseClient,
      { orderID: 'order-1', state: 'COLLECTED' },
      'state-key'
    )

    expect(result.status).toBe('unknown_order')
    const retry = fake.calls.find(
      (call) => call.table === 'integration_events' && call.op === 'update'
    )
    expect(retry?.patch).toMatchObject({ status: 'received' })
  })

  it('applies COLLECTED through ready -> picked_up and records the external state', async () => {
    const fake = db()
    fake.channelOrder = {
      id: 'co-1',
      order_id: 'order-1',
      external_status: 'DRIVER_ALLOCATED',
      orders: { status: 'preparing' },
    }

    const result = await handleOrderState(
      fake as unknown as SupabaseClient,
      { orderID: 'order-1', state: 'COLLECTED' },
      'state-key-2'
    )

    expect(result).toMatchObject({ status: 'created', detail: 'applied: ready->picked_up' })
    const orderUpdates = fake.calls.filter(
      (call) => call.table === 'orders' && call.op === 'update'
    )
    expect(orderUpdates.map((call) => (call.patch as { status: string }).status)).toEqual([
      'ready',
      'picked_up',
    ])
    const external = fake.calls.find(
      (call) => call.table === 'channel_orders' && call.op === 'update'
    )
    expect(external?.patch).toMatchObject({ external_status: 'COLLECTED' })
  })

  it('does not move the kitchen on DRIVER_ARRIVED', async () => {
    const fake = db()
    fake.channelOrder = {
      id: 'co-1',
      order_id: 'order-1',
      orders: { status: 'preparing' },
    }

    const result = await handleOrderState(
      fake as unknown as SupabaseClient,
      { orderID: 'order-1', state: 'DRIVER_ARRIVED' },
      'state-key-3'
    )

    expect(result.status).toBe('noop')
    expect(
      fake.calls.some((call) => call.table === 'orders' && call.op === 'update')
    ).toBe(false)
  })
})
