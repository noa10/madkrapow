import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/pos/receipt', () => ({ isClaimedByDiner: (raw: unknown) => raw === 'claimed' }))
const { loadPrintOrder } = await import('../order-loader')

function client(rows: Record<string, unknown>, errors: Record<string, unknown> = {}) {
  const calls: Array<{ table: string; columns: string; order?: [string, unknown] }> = []
  return {
    calls,
    from: (table: string) => {
      const call = { table, columns: '', order: undefined as [string, unknown] | undefined }
      calls.push(call)
      const query = {
        select: (columns: string) => { call.columns = columns; return query },
        eq: () => query,
        order: (column: string, options: unknown) => { call.order = [column, options]; return query },
        range: async () => ({ data: rows[table], error: errors[table] ?? null }),
        in: async () => ({ data: rows[table], error: errors[table] ?? null }),
        maybeSingle: async () => ({ data: rows[table], error: errors[table] ?? null }),
        then: (resolve: (value: unknown) => void) => resolve({ data: rows[table], error: errors[table] ?? null }),
      }
      return query
    },
  }
}

const baseRows = {
  orders: { order_number: 'MK1', source: 'web', status: 'pending', delivery_type: 'delivery', created_at: '2026-11-26T00:00:00Z', subtotal_cents: 2500, delivery_fee_cents: 500, discount_cents: 300, total_cents: 2700, payment_method: 'grabfood' },
  order_items: [{ id: 'item', menu_item_name: 'Meal', menu_item_price_cents: 1000, quantity: 2, line_total_cents: 2500 }],
  order_item_modifiers: [],
}

describe('loadPrintOrder snapshots', () => {
  it('loads saved item, fee, discount and payment snapshots', async () => {
    const order = await loadPrintOrder(client({ ...baseRows, payments: [{ method: 'qr_pay', raw: 'claimed' }] }) as never, 'order')
    expect(order).toMatchObject({
      status: 'pending', deliveryType: 'delivery',
      deliveryFeeCents: 500, discountCents: 300, totalCents: 2700,
      paymentMethod: 'qr_pay', snapshotPaymentMethod: 'grabfood', paymentClaimedByDiner: true,
    })
    expect(order?.items[0].lineTotalCents).toBe(2500)
  })

  it('preserves a diner claim from any succeeded payment', async () => {
    const order = await loadPrintOrder(client({
      ...baseRows,
      payments: [{ method: 'cash', raw: null }, { method: 'qr_pay', raw: 'claimed' }],
    }) as never, 'order')
    expect(order?.paymentMethod).toBe('cash')
    expect(order?.paymentClaimedByDiner).toBe(true)
    expect(order?.hasSucceededPayment).toBe(true)
  })

  it('orders succeeded payments deterministically', async () => {
    const db = client({ ...baseRows, payments: [{ method: 'cash', raw: null }] })
    await loadPrintOrder(db as never, 'order')
    expect(db.calls.find((call) => call.table === 'payments')?.order).toEqual(['created_at', { ascending: true }])
  })

  it('preserves the persisted total while exposing fee and discount rows', async () => {
    const order = await loadPrintOrder(client({ ...baseRows, payments: [] }) as never, 'order')
    expect((order?.subtotalCents ?? 0) + (order?.deliveryFeeCents ?? 0) - (order?.discountCents ?? 0)).toBe(order?.totalCents)
    expect(order?.hasSucceededPayment).toBe(false)
  })

  it('fails closed when the payment query fails', async () => {
    await expect(loadPrintOrder(
      client({ ...baseRows, payments: { method: 'cash', raw: null } }, { payments: { message: 'db down' } }) as never,
      'order'
    )).rejects.toThrow()
  })
})
