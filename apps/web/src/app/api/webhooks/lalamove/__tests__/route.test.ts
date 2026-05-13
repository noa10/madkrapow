import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleStatusChange, handlePodStatusChanged, handleDriverAssigned } from '../handlers'

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------
// The handler interacts with three tables via a small chain DSL:
//   .from(table).update(patch).eq(col, val) [.in(col, vals)]
//   .from(table).insert(row)
//   .from(table).select(cols).eq(col, val).single()
// We record every update/insert call against the table so tests can assert on
// the patch payloads without needing a real Postgres.
type Call =
  | { kind: 'update'; table: string; patch: Record<string, unknown>; filters: Record<string, unknown> }
  | { kind: 'insert'; table: string; row: Record<string, unknown> }

interface MockClient {
  calls: Call[]
  ordersStatus: string | null
  from: (table: string) => any
}

function buildMockClient(initial?: { ordersStatus?: string | null }): MockClient {
  const calls: Call[] = []
  const client: MockClient = {
    calls,
    ordersStatus: initial?.ordersStatus ?? 'picked_up',
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const filters: Record<string, unknown> = {}
          const chain = {
            eq(col: string, val: unknown) {
              filters[col] = val
              return chain
            },
            in(_col: string, _vals: unknown[]) {
              return chain
            },
            then(resolve: (v: { error: null }) => void) {
              calls.push({ kind: 'update', table, patch, filters })
              resolve({ error: null })
            },
          }
          // Allow `await chain` and explicit `.eq().eq().in()` chains
          return chain
        },
        insert(row: Record<string, unknown>) {
          calls.push({ kind: 'insert', table, row })
          return {
            select() {
              return {
                single: async () => ({ data: { id: 'test-event-id' }, error: null }),
              }
            },
            then(resolve: (v: { error: null }) => void) {
              resolve({ error: null })
            },
          }
        },
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                single: async () => ({ data: { status: client.ordersStatus }, error: null }),
              }
            },
          }
        },
      }
    },
  }
  return client
}

const baseShipment = {
  id: 'ship-1',
  order_id: 'order-1',
  dispatch_status: 'driver_assigned',
  driver_name: 'TestDriver 44111',
  driver_phone: '+6011144111',
  driver_plate: 'VP2381474',
  driver_photo_url: null,
  driver_latitude: null,
  driver_longitude: null,
  driver_location_updated_at: null,
}

const updatesTo = (calls: Call[], table: string) =>
  calls.filter((c): c is Extract<Call, { kind: 'update' }> => c.kind === 'update' && c.table === table)
const insertsTo = (calls: Call[], table: string) =>
  calls.filter((c): c is Extract<Call, { kind: 'insert' }> => c.kind === 'insert' && c.table === table)

beforeEach(() => {
  vi.resetModules()
  // Stub out lazy-loaded notification side-effects so the handler doesn't try
  // to import @resend/resend or hit the bot worker during tests.
  vi.doMock('@/lib/notifications/shipping-emails', () => ({
    sendShippingNotification: vi.fn(async () => undefined),
  }))
  vi.doMock('@/lib/bots/order-notifications', () => ({
    sendOrderStatusNotification: vi.fn(async () => undefined),
  }))
})

describe('handleStatusChange — driver rejection revert (US-002)', () => {
  it('clears driver fields on shipment when reverting from driver_assigned to driver_pending', async () => {
    const supabase = buildMockClient()
    const data = { order: { status: 'ASSIGNING_DRIVER' } }

    await handleStatusChange(supabase as any, baseShipment, 'lala-1', data)

    const shipmentUpdate = updatesTo(supabase.calls, 'lalamove_shipments')[0]
    expect(shipmentUpdate.patch.dispatch_status).toBe('driver_pending')
    expect(shipmentUpdate.patch.driver_name).toBeNull()
    expect(shipmentUpdate.patch.driver_phone).toBeNull()
    expect(shipmentUpdate.patch.driver_plate).toBeNull()
    expect(shipmentUpdate.patch.driver_photo_url).toBeNull()
    expect(shipmentUpdate.patch.driver_latitude).toBeNull()
    expect(shipmentUpdate.patch.driver_longitude).toBeNull()
    expect(shipmentUpdate.patch.driver_location_updated_at).toBeNull()
  })

  it('clears driver fields on orders and does NOT change orders.status', async () => {
    const supabase = buildMockClient({ ordersStatus: 'picked_up' })
    await handleStatusChange(
      supabase as any,
      { ...baseShipment, dispatch_status: 'in_transit' },
      'lala-1',
      { order: { status: 'ASSIGNING_DRIVER' } }
    )

    const ordersUpdate = updatesTo(supabase.calls, 'orders')[0]
    expect(ordersUpdate.patch.driver_name).toBeNull()
    expect(ordersUpdate.patch.driver_phone).toBeNull()
    expect(ordersUpdate.patch.driver_plate_number).toBeNull()
    expect(ordersUpdate.patch.dispatch_status).toBe('driver_pending')
    expect(ordersUpdate.patch.lalamove_status).toBe('ASSIGNING_DRIVER')
    expect(ordersUpdate.patch.status).toBeUndefined()
  })

  it('emits driver_rejected event with prior driver identity', async () => {
    const supabase = buildMockClient()
    await handleStatusChange(supabase as any, baseShipment, 'lala-1', {
      order: { status: 'ASSIGNING_DRIVER' },
    })

    const event = insertsTo(supabase.calls, 'order_events')[0]
    expect(event.row.event_type).toBe('driver_rejected')
    expect((event.row.old_value as Record<string, unknown>).driver_name).toBe('TestDriver 44111')
    expect((event.row.old_value as Record<string, unknown>).driver_phone).toBe('+6011144111')
    expect((event.row.old_value as Record<string, unknown>).driver_plate).toBe('VP2381474')
    expect((event.row.old_value as Record<string, unknown>).lalamove_order_id).toBe('lala-1')
  })

  it('does not clear driver fields on legitimate forward progress (driver_pending → driver_assigned)', async () => {
    const supabase = buildMockClient()
    const shipment = { ...baseShipment, dispatch_status: 'driver_pending', driver_name: null, driver_phone: null, driver_plate: null }
    // The ON_GOING branch calls updateDriverDetails which would hit the
    // network for driver lookup. To keep this test pure, skip ON_GOING and
    // verify the basic forward path with an upstream status.
    await handleStatusChange(supabase as any, shipment, 'lala-1', {
      order: { status: 'PICKED_UP' },
    })

    const shipmentUpdate = updatesTo(supabase.calls, 'lalamove_shipments')[0]
    expect(shipmentUpdate.patch.dispatch_status).toBe('in_transit')
    expect(shipmentUpdate.patch.driver_name).toBeUndefined()
    expect(shipmentUpdate.patch.driver_phone).toBeUndefined()
  })
})

describe('handleStatusChange — terminal REJECTED / EXPIRED (US-003)', () => {
  it('REJECTED sets dispatch_status=manual_review, clears driver, emits delivery_rejected', async () => {
    const supabase = buildMockClient()
    await handleStatusChange(supabase as any, baseShipment, 'lala-1', {
      order: { status: 'REJECTED' },
    })

    const shipmentUpdate = updatesTo(supabase.calls, 'lalamove_shipments')[0]
    expect(shipmentUpdate.patch.dispatch_status).toBe('manual_review')
    expect(shipmentUpdate.patch.driver_name).toBeNull()
    expect(shipmentUpdate.patch.cancelled_at).toBeUndefined()
    expect(shipmentUpdate.patch.completed_at).toBeUndefined()

    const event = insertsTo(supabase.calls, 'order_events')[0]
    expect(event.row.event_type).toBe('delivery_rejected')
    expect((event.row.new_value as Record<string, unknown>).reason).toBe('rejection_limit')
  })

  it('EXPIRED sets dispatch_status=failed, clears driver, emits delivery_expired', async () => {
    const supabase = buildMockClient()
    await handleStatusChange(supabase as any, baseShipment, 'lala-1', {
      order: { status: 'EXPIRED' },
    })

    const shipmentUpdate = updatesTo(supabase.calls, 'lalamove_shipments')[0]
    expect(shipmentUpdate.patch.dispatch_status).toBe('failed')
    expect(shipmentUpdate.patch.driver_name).toBeNull()
    expect(shipmentUpdate.patch.cancelled_at).toBeUndefined()
    expect(shipmentUpdate.patch.completed_at).toBeUndefined()

    const event = insertsTo(supabase.calls, 'order_events')[0]
    expect(event.row.event_type).toBe('delivery_expired')
    expect((event.row.new_value as Record<string, unknown>).reason).toBe('expired')
  })

  it('does not auto-cancel orders.status on REJECTED', async () => {
    const supabase = buildMockClient({ ordersStatus: 'picked_up' })
    await handleStatusChange(supabase as any, baseShipment, 'lala-1', {
      order: { status: 'REJECTED' },
    })

    const ordersUpdate = updatesTo(supabase.calls, 'orders')[0]
    expect(ordersUpdate.patch.status).toBeUndefined()
    expect(ordersUpdate.patch.dispatch_status).toBe('manual_review')
  })

  it('does not auto-cancel orders.status on EXPIRED', async () => {
    const supabase = buildMockClient({ ordersStatus: 'ready' })
    await handleStatusChange(supabase as any, baseShipment, 'lala-1', {
      order: { status: 'EXPIRED' },
    })

    const ordersUpdate = updatesTo(supabase.calls, 'orders')[0]
    expect(ordersUpdate.patch.status).toBeUndefined()
    expect(ordersUpdate.patch.dispatch_status).toBe('failed')
  })
})

describe('handleStatusChange — orders.status preservation (AC4)', () => {
  it('keeps a picked_up order at picked_up after rejection revert', async () => {
    const supabase = buildMockClient({ ordersStatus: 'picked_up' })
    await handleStatusChange(supabase as any, baseShipment, 'lala-1', {
      order: { status: 'ASSIGNING_DRIVER' },
    })

    const ordersUpdate = updatesTo(supabase.calls, 'orders')[0]
    // No `status` key in the patch means orders.status is left intact.
    expect(ordersUpdate.patch.status).toBeUndefined()
  })

  it('skips orders update entirely when orders.status is already cancelled', async () => {
    const supabase = buildMockClient({ ordersStatus: 'cancelled' })
    await handleStatusChange(supabase as any, baseShipment, 'lala-1', {
      order: { status: 'REJECTED' },
    })

    // Only the shipment write happens before the cancelled-guard fires.
    expect(updatesTo(supabase.calls, 'orders')).toHaveLength(0)
  })
})

describe('handleStatusChange — invalid transitions (AC5 idempotency)', () => {
  it('rejects an attempt to revert a delivered shipment to driver_pending', async () => {
    const supabase = buildMockClient()
    await handleStatusChange(
      supabase as any,
      { ...baseShipment, dispatch_status: 'delivered' },
      'lala-1',
      { order: { status: 'ASSIGNING_DRIVER' } }
    )
    expect(updatesTo(supabase.calls, 'lalamove_shipments')).toHaveLength(0)
    expect(insertsTo(supabase.calls, 'order_events')).toHaveLength(0)
  })
})

describe('handlePodStatusChanged', () => {
  const podData = {
    order: {
      orderId: 'lala-1',
      status: 'PICKED_UP',
      stops: [
        {
          coordinates: { lat: '3.14', lng: '101.52' },
          name: 'Mad Krapow Store',
          phone: '0193456476',
        },
        {
          coordinates: { lat: '3.14', lng: '101.52' },
          name: 'Customer',
          phone: '0194567476',
          POD: {
            status: 'DELIVERED',
            image: 'http://example.com/pod.png',
            deliveredAt: '2026-05-14T03:16:00Z',
          },
        },
      ],
    },
    updatedAt: '2026-05-14T03:16:00Z',
  }

  it('persists raw_webhook_payload and emits a pod_received order_event', async () => {
    const supabase = buildMockClient()
    await handlePodStatusChanged(supabase as any, baseShipment, podData)

    const shipmentUpdates = updatesTo(supabase.calls, 'lalamove_shipments')
    expect(shipmentUpdates).toHaveLength(1)
    expect(shipmentUpdates[0].patch.raw_webhook_payload).toEqual(podData)

    const events = insertsTo(supabase.calls, 'order_events')
    expect(events).toHaveLength(1)
    expect(events[0].row.event_type).toBe('pod_received')
    expect(events[0].row.new_value).toMatchObject({
      pod_status: 'DELIVERED',
      pod_image: 'http://example.com/pod.png',
      pod_delivered_at: '2026-05-14T03:16:00Z',
      lalamove_status: 'PICKED_UP',
    })
  })

  it('still records an event when POD section is missing', async () => {
    const supabase = buildMockClient()
    const payloadNoPod = { order: { orderId: 'lala-1', status: 'PICKED_UP', stops: [] } }
    await handlePodStatusChanged(supabase as any, baseShipment, payloadNoPod)

    const events = insertsTo(supabase.calls, 'order_events')
    expect(events).toHaveLength(1)
    expect(events[0].row.event_type).toBe('pod_received')
    expect(events[0].row.new_value).toMatchObject({
      pod_status: null,
      pod_image: null,
      pod_delivered_at: null,
    })
  })
})

describe('handleDriverAssigned — payload shape variants', () => {
  const driverPendingShipment = { ...baseShipment, dispatch_status: 'driver_pending' }

  it('uses inline driver record from data.driver (sandbox shape) without calling getDriverDetails', async () => {
    // The inline-driver path never reaches createLalamoveClient, so the
    // top-level import is fine and we don't need a doMock here.
    const supabase = buildMockClient()
    const data = {
      order: { orderId: 'lala-1' },
      driver: {
        driverId: '80039',
        name: 'TestDriver 44111',
        phone: '+6011144111',
        plateNumber: 'VP2381474',
        photo: '',
      },
    }

    await handleDriverAssigned(supabase as any, driverPendingShipment, 'lala-1', data)

    const shipmentUpdates = updatesTo(supabase.calls, 'lalamove_shipments')
    const driverWrite = shipmentUpdates.find((u) => u.patch.driver_name === 'TestDriver 44111')
    expect(driverWrite).toBeDefined()
    expect(driverWrite?.patch.driver_phone).toBe('+6011144111')
    expect(driverWrite?.patch.driver_plate).toBe('VP2381474')

    const ordersWrites = updatesTo(supabase.calls, 'orders')
    const ordersDriver = ordersWrites.find((u) => u.patch.driver_name === 'TestDriver 44111')
    expect(ordersDriver?.patch.driver_plate_number).toBe('VP2381474')

    const events = insertsTo(supabase.calls, 'order_events')
    expect(events).toHaveLength(1)
    expect(events[0].row.event_type).toBe('driver_assigned')
    expect(events[0].row.new_value).toMatchObject({
      driver_name: 'TestDriver 44111',
      driver_plate: 'VP2381474',
    })
  })

  it('falls back to GET /v3/orders/{id} when only data.order.orderId is present', async () => {
    // createLalamoveClient is statically imported in handlers.ts, so mock
    // it then re-import the handler to pick up the mocked module.
    vi.doMock('@/lib/lalamove/client', () => ({
      createLalamoveClient: () => ({
        getOrderDetails: vi.fn(async () => ({ driverId: 'fetched-driver-id' })),
        getDriverDetails: vi.fn(async () => ({
          driverId: 'fetched-driver-id',
          name: 'Fetched Driver',
          phone: '+60100000000',
          plateNumber: 'PLATE-FETCHED',
          photo: null,
          coordinates: null,
        })),
      }),
    }))
    const { handleDriverAssigned: freshHandler } = await import('../handlers')
    const supabase = buildMockClient()

    await freshHandler(supabase as any, driverPendingShipment, 'lala-1', {
      order: { orderId: 'lala-1' },
    })

    const events = insertsTo(supabase.calls, 'order_events')
    expect(events[0]?.row.event_type).toBe('driver_assigned')
    expect(events[0]?.row.new_value).toMatchObject({ driver_name: 'Fetched Driver' })
  })

  it('logs payload keys and returns when no driverId can be discovered', async () => {
    vi.doMock('@/lib/lalamove/client', () => ({
      createLalamoveClient: () => ({
        getOrderDetails: vi.fn(async () => ({ driverId: '' })),
        getDriverDetails: vi.fn(),
      }),
    }))
    const { handleDriverAssigned: freshHandler } = await import('../handlers')
    const supabase = buildMockClient()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await freshHandler(supabase as any, driverPendingShipment, 'lala-1', {
      order: { orderId: 'lala-1' },
    })

    expect(warnSpy).toHaveBeenCalled()
    const warnMessage = warnSpy.mock.calls.map((c) => c[0] as string).join('\n')
    expect(warnMessage).toMatch(/DRIVER_ASSIGNED without driverId/)
    expect(warnMessage).toMatch(/data keys: order/)
    expect(insertsTo(supabase.calls, 'order_events')).toHaveLength(0)
    warnSpy.mockRestore()
  })
})
