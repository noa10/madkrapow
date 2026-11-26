import { afterEach, describe, expect, it, vi } from 'vitest'
import { printJobInBrowser, printReceiptInBrowser } from '../client'

afterEach(() => vi.unstubAllGlobals())

describe('browser receipt printing', () => {
  it('reports blocked popups without fetching customer data', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('window', { open: () => null })
    vi.stubGlobal('fetch', fetchMock)
    expect(await printReceiptInBrowser('order')).toEqual({ ok: false, error: 'Allow pop-ups to print a receipt.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('opens the receipt and offers a print button', async () => {
    const button = { textContent: '', onclick: () => {} }
    const style = { textContent: '' }
    const popup = {
      opener: {}, closed: false, focus: vi.fn(), print: vi.fn(), close: vi.fn(),
      document: {
        title: '', body: { textContent: '', prepend: vi.fn() }, head: { append: vi.fn() },
        open: vi.fn(), write: vi.fn(), close: vi.fn(),
        createElement: vi.fn((name: string) => name === 'button' ? button : style),
      },
    }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ html: '<html>receipt</html>' }) })
    vi.stubGlobal('window', { open: () => popup })
    vi.stubGlobal('fetch', fetchMock)
    expect(await printReceiptInBrowser('order')).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/print/jobs/receipt-document', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ order_id: 'order', type: 'receipt' }),
    }))
    expect(popup.document.write).toHaveBeenCalledWith('<html>receipt</html>')
    expect(popup.print).toHaveBeenCalledOnce()
    button.onclick()
    expect(popup.print).toHaveBeenCalledTimes(2)
  })

  it('closes the popup and reports an authorization failure', async () => {
    const popup = { opener: {}, document: { title: '', body: { textContent: '' } }, close: vi.fn() }
    vi.stubGlobal('window', { open: () => popup })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    expect(await printReceiptInBrowser('order')).toEqual({ ok: false, error: 'Unable to load receipt (HTTP 403)' })
    expect(popup.close).toHaveBeenCalledOnce()
  })

  it('opens the popup synchronously and posts the requested job type', async () => {
    const button = { textContent: '', onclick: () => {} }
    const style = { textContent: '' }
    const popup = {
      opener: {}, closed: false, focus: vi.fn(), print: vi.fn(), close: vi.fn(),
      document: {
        title: '', body: { textContent: '', prepend: vi.fn() }, head: { append: vi.fn() },
        open: vi.fn(), write: vi.fn(), close: vi.fn(),
        createElement: vi.fn((name: string) => name === 'button' ? button : style),
      },
    }
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<{ html: string }> }) => void
    const fetchMock = vi.fn(() => new Promise((resolve) => { resolveFetch = resolve }))
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', { open })
    vi.stubGlobal('fetch', fetchMock)

    const pending = printJobInBrowser('order', 'kitchen_docket')
    // Popup blockers only allow a window opened during the click itself, so
    // the window must exist before the request resolves.
    expect(open).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/print/jobs/receipt-document', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ order_id: 'order', type: 'kitchen_docket' }),
    }))
    resolveFetch({ ok: true, json: async () => ({ html: '<html>docket</html>' }) })
    expect(await pending).toEqual({ ok: true })
    expect(popup.document.write).toHaveBeenCalledWith('<html>docket</html>')
    expect(button.textContent).toBe('Print kitchen docket')
    expect(popup.print).toHaveBeenCalledOnce()
  })
})
