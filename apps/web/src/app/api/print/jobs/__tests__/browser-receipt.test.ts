import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const loadPrintOrder = vi.fn()
const getServiceClient = vi.fn()
vi.mock('@/lib/admin/require-role', () => ({ requireRole }))
vi.mock('@/lib/printing/order-loader', () => ({ loadPrintOrder }))
vi.mock('@/lib/supabase/server', () => ({ getServiceClient }))
vi.mock('@/lib/validators/env', () => ({ env: { STORE_ADDRESS: 'Store address', STORE_PHONE: '0123' } }))

vi.mock('@/lib/printing/jobs', () => import('../../../../../lib/printing/jobs'))
vi.mock('@/lib/printing/receipt-html', () => import('../../../../../lib/printing/receipt-html'))
// Plain function (not vi.fn) so beforeEach's resetAllMocks cannot strip the value.
vi.mock('@/lib/printing/store-settings', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/printing/store-settings')>(),
  loadPrintStoreSettings: async () => ({
    storeName: 'Mad Krapow', address: 'Store address', phone: '0123',
    companyName: '', companyRegistration: '', footer: '', taxRatePercent: 0,
    paperWidth: '80', autoPrintEnabled: true,
  }),
}))

const { POST } = await import('../receipt-document/route')
const id = '6a1b2c3d-4e5f-4a1b-8c2d-3e4f5a6b7c8d'
const request = (orderId: string, type?: 'kitchen_docket' | 'receipt' | 'grabfood_ticket') => new NextRequest('http://localhost/api/print/jobs/browser-receipt', {
  method: 'POST',
  body: JSON.stringify(type ? { order_id: orderId, type } : { order_id: orderId }),
})

beforeEach(() => {
  vi.resetAllMocks()
  requireRole.mockResolvedValue({ user: { app_metadata: { role: 'admin' } } })
})

describe('browser receipt', () => {
  it('rejects unauthorized users before loading orders', async () => {
    requireRole.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await POST(request(id))).status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(expect.anything(), ['admin', 'manager', 'cashier', 'kitchen'])
    expect(getServiceClient).not.toHaveBeenCalled()
  })

  it('validates the order id and returns 404 for missing orders', async () => {
    expect((await POST(request('invalid'))).status).toBe(400)
    expect(getServiceClient).not.toHaveBeenCalled()
    loadPrintOrder.mockResolvedValue(null)
    expect((await POST(request(id))).status).toBe(404)
  })

  it.each<Record<string, string>>([{ cookie: 'session=staff' }, { authorization: 'Bearer staff-token' }])('uses the verified kitchen role for %o authentication', async (headers) => {
    requireRole.mockResolvedValue({ user: { app_metadata: { role: 'kitchen' } } })
    loadPrintOrder.mockResolvedValue({ orderNumber: 'MK1', source: 'web', status: 'delivered', deliveryType: 'delivery', createdAt: '2026-11-26T10:00:00Z', items: [], subtotalCents: 0, totalCents: 0 })
    const req = new NextRequest('http://localhost/api/print/jobs/receipt-document', {
      method: 'POST', headers, body: JSON.stringify({ order_id: id }),
    })
    expect((await POST(req)).status).toBe(404)
    expect(requireRole).toHaveBeenCalledWith(req, ['admin', 'manager', 'cashier', 'kitchen'])

    loadPrintOrder.mockResolvedValue({ orderNumber: 'MK1', source: 'web', status: 'ready', deliveryType: 'delivery', createdAt: '2026-11-26T10:00:00Z', items: [], subtotalCents: 0, totalCents: 0 })
    const readyReq = new NextRequest('http://localhost/api/print/jobs/receipt-document', {
      method: 'POST', headers, body: JSON.stringify({ order_id: id }),
    })
    expect((await POST(readyReq)).status).toBe(200)
  })

  it('does not rely on client claims for role authorization', async () => {
    requireRole.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const req = new NextRequest('http://localhost/api/print/jobs/receipt-document', {
      method: 'POST', headers: { cookie: 'role=admin', authorization: 'Bearer staff-token' },
      body: JSON.stringify({ order_id: id }),
    })
    expect((await POST(req)).status).toBe(403)
    expect(loadPrintOrder).not.toHaveBeenCalled()
  })

  it('returns 503 when receipt data cannot be loaded safely', async () => {
    loadPrintOrder.mockRejectedValue(new Error('payments unavailable'))
    expect((await POST(request(id))).status).toBe(503)
  })

  it('renders saved totals and the diner-claimed payment warning', async () => {
    loadPrintOrder.mockResolvedValue({
      orderNumber: 'MK123', source: 'web', createdAt: '2026-11-26T10:00:00Z',
      customerName: `<img src=x onerror="alert('x')">`,
      items: [{ name: '<script>bad</script>', quantity: 1, priceCents: 1200 }],
      subtotalCents: 1200, totalCents: 1500, paymentMethod: 'qr_pay', paymentClaimedByDiner: true,
    })
    const response = await POST(request(id))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { html } = await response.json()
    expect(html).toContain('RM 15.00')
    expect(html).toContain('CLAIMED BY CUSTOMER - VERIFY TRANSFER')
    expect(html).toContain('** REPRINT **')
    expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;')
    // The static store logo is the only image; customer text must stay escaped.
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('https://')
  })

  it('indents receipt item details with CSS so wrapped lines stay aligned', async () => {
    loadPrintOrder.mockResolvedValue({
      orderNumber: 'MK123', source: 'web', createdAt: '2026-11-26T10:00:00Z',
      items: [{ name: 'Meal', quantity: 1, priceCents: 1200, modifiers: [{ name: 'Extra & spicy', quantity: 1 }], notes: 'A long note that can wrap' }],
      subtotalCents: 1200, totalCents: 1200,
    })
    const response = await POST(request(id))
    const { html } = await response.json()
    expect(html).toContain('<div class="" style="padding-left:3ch">* Extra &amp; spicy</div>')
    expect(html).toContain('<div class="bold" style="padding-left:3ch">* A long note that can wrap</div>')
  })

  it('renders a kitchen docket without prices when requested', async () => {
    loadPrintOrder.mockResolvedValue({
      orderNumber: 'MK123', source: 'web', createdAt: '2026-11-26T10:00:00Z',
      items: [{ name: 'Nasi Lemak', quantity: 2, priceCents: 1250 }],
      subtotalCents: 2500, totalCents: 2500,
    })
    const response = await POST(request(id, 'kitchen_docket'))
    expect(response.status).toBe(200)
    const { html } = await response.json()
    expect(html).toContain('2x Nasi Lemak')
    expect(html).toContain('Total items')
    expect(html).toContain('** REPRINT **')
    expect(html).not.toContain('RM 25.00')
  })

  it.each([
    { source: 'grabfood', expected: 'GF-659', absent: 'MK-77' },
    { source: 'web', expected: 'MK-77', absent: 'GF-659' },
  ])('renders the $source docket number and indented item details in HTML', async ({ source, expected, absent }) => {
    loadPrintOrder.mockResolvedValue({
      orderNumber: 'MK123', source, externalOrderNumber: 'GF-659', displayCode: 'MK-77',
      createdAt: '2026-11-26T10:00:00Z',
      items: [{ name: 'Meal', quantity: 1, priceCents: 1200, modifiers: [{ name: 'Extra & spicy', quantity: 1 }], notes: 'Less rice | No egg' }],
      subtotalCents: 1200, totalCents: 1200,
    })
    const response = await POST(request(id, 'kitchen_docket'))
    expect(response.status).toBe(200)
    const { html } = await response.json()
    expect(html).toContain(`>${expected}</div>`)
    expect(html).not.toContain(absent)
    expect(html).toContain('<div class="" style="padding-left:3ch">* Extra &amp; spicy</div>')
    expect(html).toContain('<div class="bold" style="padding-left:3ch">* Less rice</div>')
    expect(html).toContain('<div class="bold" style="padding-left:3ch">* No egg</div>')
  })

  it('rejects an unknown print job type', async () => {
    const req = new NextRequest('http://localhost/api/print/jobs/receipt-document', {
      method: 'POST', body: JSON.stringify({ order_id: id, type: 'poster' }),
    })
    expect((await POST(req)).status).toBe(400)
    expect(loadPrintOrder).not.toHaveBeenCalled()
  })
})
