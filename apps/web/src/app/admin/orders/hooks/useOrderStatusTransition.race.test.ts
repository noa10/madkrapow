import { afterEach, expect, it, vi } from 'vitest'
import { useOrderStatusTransition } from './useOrderStatusTransition'

const { state, refs, addToast } = vi.hoisted(() => ({
  state: { values: [] as unknown[], index: 0 },
  refs: { values: [] as { current: unknown }[], index: 0 },
  addToast: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = state.index++
    if (!(index in state.values)) state.values[index] = initial
    return [state.values[index], (value: unknown) => { state.values[index] = value }]
  },
  useRef: (initial: unknown) => {
    const index = refs.index++
    return refs.values[index] ??= { current: initial }
  },
  useLayoutEffect: (effect: () => void) => effect(),
  useCallback: (callback: unknown) => callback,
}))
vi.mock('@/stores/toast', () => ({
  useToastStore: (selector: (value: { addToast: typeof addToast }) => unknown) => selector({ addToast }),
}))

function render(currentStatus: string, onStatusChange: (status: string) => void) {
  state.index = 0
  refs.index = 0
  // React hooks are replaced with test doubles in this lightweight harness.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useOrderStatusTransition({ orderId: 'order-1', currentStatus, createdAt: '2020-01-01T00:00:00Z', onStatusChange })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  state.values.length = 0
  refs.values.length = 0
})

it('does not overwrite a newer realtime status when the request resolves late', async () => {
  let resolveResponse!: (response: unknown) => void
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveResponse = resolve })))
  const onStatusChange = vi.fn()
  render('preparing', onStatusChange).handleForwardAction()
  expect(render('preparing', onStatusChange).effectiveStatus).toBe('ready')

  render('delivered', onStatusChange)
  expect(render('delivered', onStatusChange).effectiveStatus).toBe('delivered')
  resolveResponse({ ok: true, json: async () => ({ success: true, status: 'ready' }) })
  await vi.waitFor(() => expect(addToast).toHaveBeenCalled())

  expect(render('delivered', onStatusChange).effectiveStatus).toBe('delivered')
  expect(onStatusChange).not.toHaveBeenCalled()
})
