import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

// Keep component state between renders so the payment request can be exercised
// without a browser or a live payment provider.
const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = state.cursor++
      if (!(index in state.values)) state.values[index] = initial
      return [state.values[index], (value: unknown) => { state.values[index] = value }]
    },
  }
})

import { BulkOrderReview } from '../BulkOrderReview'

type ElementProps = {
  children?: ReactNode
  type?: string
  value?: unknown
  onClick?: () => Promise<void>
  onChange?: (event: { target: { value: string } }) => void
}

function findElement(node: ReactNode, matches: (element: ReactElement<ElementProps>) => boolean): ReactElement<ElementProps> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, matches)
      if (found) return found
    }
    return undefined
  }
  if (!isValidElement<ElementProps>(node)) return undefined
  if (matches(node)) return node
  return findElement(node.props.children, matches)
}

const update = vi.fn()
const props = {
  orderId: 'bulk-order-1',
  approvalStatus: 'pending_review',
  subtotalCents: 3300,
  bulkCompanyName: 'Example Co',
  bulkRequestedDate: null,
  bulkBudgetCents: null,
  bulkInvoiceName: null,
  bulkContactPhone: null,
  bulkSpecialNotes: null,
  bulkDropoffInstructions: null,
  reviewNotes: null,
  approvedTotalCents: null,
  onStatusUpdate: update,
}

function render() {
  state.cursor = 0
  return BulkOrderReview(props)
}

function approveButton(tree: ReactNode) {
  return findElement(tree, (element) =>
    Array.isArray(element.props.children) && element.props.children.includes('Approve & Send Payment Link'),
  )
}

beforeEach(() => {
  state.values = []
  state.cursor = 0
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BulkOrderReview payment amount', () => {
  it('submits the displayed initial total as integer cents', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      json: async () => ({ success: true, checkoutUrl: 'https://example.test/session' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const tree = render()
    const input = findElement(tree, (element) => element.props.type === 'number')
    expect(input?.props.value).toBe('33.00')

    await approveButton(tree)?.props.onClick?.()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ approved_total_cents: 3300 })
    expect(update).toHaveBeenCalledWith('approved', 3300, '')
  })

  it('submits an edited ringgit amount as integer cents', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      json: async () => ({ success: true, checkoutUrl: 'https://example.test/session' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const input = findElement(render(), (element) => element.props.type === 'number')
    input?.props.onChange?.({ target: { value: '41.27' } })
    const tree = render()
    expect(findElement(tree, (element) => element.props.type === 'number')?.props.value).toBe('41.27')

    await approveButton(tree)?.props.onClick?.()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({ approved_total_cents: 4127 })
    expect(update).toHaveBeenCalledWith('approved', 4127, '')
  })
})
