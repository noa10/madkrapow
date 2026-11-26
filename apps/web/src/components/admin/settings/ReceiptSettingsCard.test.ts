import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'

/**
 * apps/web has no DOM test stack: components are exercised by calling them
 * directly and walking the returned element tree. Hooks are faked here so the
 * card's own state survives a manual re-render, while child components
 * (Card, Input, ...) are never invoked.
 */
const state = vi.hoisted(() => ({
  values: [] as unknown[],
  index: 0,
  effect: undefined as (() => void | (() => void)) | undefined,
}))

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (initial: unknown) => {
    const index = state.index++
    if (!(index in state.values)) {
      state.values[index] =
        typeof initial === 'function' ? (initial as () => unknown)() : initial
    }
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value
      },
    ]
  },
  useEffect: (effect: () => void | (() => void)) => {
    state.effect = effect
  },
}))

import { ReceiptSettingsCard } from './ReceiptSettingsCard'
import { Select } from '@/components/ui/select'

type AnyElement = ReactElement<Record<string, unknown>>

const SAMPLE = {
  receipt_store_name: 'Mad Krapow Subang Permai',
  address: '52, Jalan Subang Permai, Subang Jaya',
  phone: '+60193456476',
  company_name: 'Bakaris Enterprise',
  company_registration: '201903057932',
  receipt_footer: 'Powered by Mad Krapow',
  tax_rate_percent: 6,
  receipt_paper_width: '80',
  auto_print_enabled: true,
}

function findAll(
  node: ReactNode,
  predicate: (element: AnyElement) => boolean
): AnyElement[] {
  const found: AnyElement[] = []
  const visit = (child: ReactNode) => {
    Children.forEach(child, (item) => {
      if (!isValidElement(item)) return
      const element = item as AnyElement
      if (predicate(element)) found.push(element)
      visit(element.props.children as ReactNode)
    })
  }
  visit(node)
  return found
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children)
  }
  return ''
}

function byId(node: ReactNode, id: string): AnyElement {
  const element = findAll(node, (candidate) => candidate.props.id === id)[0]
  if (!element) throw new Error(`no element with id "${id}"`)
  return element
}

function saveButton(node: ReactNode): AnyElement {
  const element = findAll(
    node,
    (candidate) => typeof candidate.props.onClick === 'function'
  )[0]
  if (!element) throw new Error('no save button')
  return element
}

function render(): ReactNode {
  state.index = 0
  return ReceiptSettingsCard() as ReactNode
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

async function renderLoaded(fetchMock: ReturnType<typeof vi.fn>): Promise<ReactNode> {
  vi.stubGlobal('fetch', fetchMock)
  render()
  expect(state.effect).toBeDefined()
  state.effect!()
  await flush()
  return render()
}

beforeEach(() => {
  state.values = []
  state.index = 0
  state.effect = undefined
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ReceiptSettingsCard', () => {
  it('shows a skeleton until the settings arrive', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...SAMPLE }) })
    )

    const tree = render()
    const skeletons = findAll(
      tree,
      (element) =>
        typeof element.props.className === 'string' &&
        element.props.className.includes('animate-pulse')
    )

    expect(skeletons).toHaveLength(1)
    expect(findAll(tree, (element) => typeof element.props.onClick === 'function')).toHaveLength(0)
  })

  it('loads the saved settings into the form', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...SAMPLE }),
    })

    const tree = await renderLoaded(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/print-settings', {
      cache: 'no-store',
    })
    expect(byId(tree, 'receipt-store-name').props.value).toBe(
      'Mad Krapow Subang Permai'
    )
    expect(byId(tree, 'receipt-address').props.value).toBe(
      '52, Jalan Subang Permai, Subang Jaya'
    )
    expect(byId(tree, 'receipt-phone').props.value).toBe('+60193456476')
    expect(byId(tree, 'receipt-company-name').props.value).toBe(
      'Bakaris Enterprise'
    )
    expect(byId(tree, 'receipt-company-registration').props.value).toBe(
      '201903057932'
    )
    expect(byId(tree, 'receipt-footer').props.value).toBe(
      'Powered by Mad Krapow'
    )
    expect(byId(tree, 'receipt-tax-rate').props.value).toBe('6')
    expect(byId(tree, 'receipt-auto-print').props.checked).toBe(true)

    const paperWidth = findAll(tree, (element) => element.type === Select)[0]
    expect(paperWidth.props.value).toBe('80')
  })

  it('saves edits with PATCH and reports success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...SAMPLE }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          settings: {
            ...SAMPLE,
            receipt_store_name: 'Mad Krapow USJ',
            receipt_footer: '',
            tax_rate_percent: 0,
            receipt_paper_width: '58',
            auto_print_enabled: false,
          },
        }),
      })

    let tree: ReactNode = await renderLoaded(fetchMock)

    // Edit the name, clear the footer, hide SST, switch to 58 mm, stop auto-print.
    ;(byId(tree, 'receipt-store-name').props.onChange as (event: unknown) => void)({
      target: { value: 'Mad Krapow USJ' },
    })
    tree = render()
    ;(byId(tree, 'receipt-footer').props.onChange as (event: unknown) => void)({
      target: { value: '' },
    })
    tree = render()
    ;(byId(tree, 'receipt-tax-rate').props.onChange as (event: unknown) => void)({
      target: { value: '0' },
    })
    tree = render()
    const paperWidth = findAll(tree, (element) => element.type === Select)[0]
    ;(paperWidth.props.onValueChange as (value: string) => void)('58')
    tree = render()
    ;(byId(tree, 'receipt-auto-print').props.onCheckedChange as (value: boolean) => void)(false)
    tree = render()

    const saving = (saveButton(tree).props.onClick as () => Promise<void>)()

    // While the request is in flight the button is disabled and relabelled.
    const pending = render()
    expect(saveButton(pending).props.disabled).toBe(true)
    expect(textOf(pending)).toContain('Saving...')

    await saving
    await flush()
    const saved = render()

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/admin/print-settings',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const body = JSON.parse(
      (fetchMock.mock.calls[1][1] as { body: string }).body
    )
    expect(body).toEqual({
      receipt_store_name: 'Mad Krapow USJ',
      address: '52, Jalan Subang Permai, Subang Jaya',
      phone: '+60193456476',
      company_name: 'Bakaris Enterprise',
      company_registration: '201903057932',
      receipt_footer: '',
      tax_rate_percent: 0,
      receipt_paper_width: '58',
      auto_print_enabled: false,
    })

    expect(saveButton(saved).props.disabled).toBe(false)
    expect(textOf(saved)).toContain('Receipt settings saved')
  })

  it('shows the server error inline when saving fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...SAMPLE }) })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ success: false, error: 'Failed to update receipt settings' }),
      })

    const loaded = await renderLoaded(fetchMock)
    await (saveButton(loaded).props.onClick as () => Promise<void>)()
    await flush()
    const tree = render()

    expect(textOf(tree)).toContain('Failed to update receipt settings')
    expect(textOf(tree)).not.toContain('Receipt settings saved')
  })

  it('rejects an unparseable SST rate without calling the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...SAMPLE }),
    })

    let tree: ReactNode = await renderLoaded(fetchMock)
    ;(byId(tree, 'receipt-tax-rate').props.onChange as (event: unknown) => void)({
      target: { value: '' },
    })
    tree = render()
    await (saveButton(tree).props.onClick as () => Promise<void>)()
    await flush()
    tree = render()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(textOf(tree)).toContain('SST rate must be a number between 0 and 100')
  })

  it('shows a load error when the settings cannot be fetched', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    render()
    state.effect!()
    await flush()
    const tree = render()

    expect(textOf(tree)).toContain('Failed to load receipt settings')
    expect(findAll(tree, (element) => typeof element.props.onClick === 'function')).toHaveLength(0)
  })
})
