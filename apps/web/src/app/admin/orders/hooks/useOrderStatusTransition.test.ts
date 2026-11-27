import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOrderStatusTransition } from './useOrderStatusTransition'

const { setters, addToast } = vi.hoisted(() => ({
  setters: [] as ReturnType<typeof vi.fn>[],
  addToast: vi.fn(),
}))

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const setter = vi.fn()
    setters.push(setter)
    return [initial, setter]
  },
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => ({ current: initial }),
  useLayoutEffect: (effect: () => void) => effect(),
}))
vi.mock('@/stores/toast', () => ({
  useToastStore: (selector: (state: { addToast: typeof addToast }) => unknown) => selector({ addToast }),
}))

function startTransition(response: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  const onStatusChange = vi.fn()
  // React hooks are replaced with test doubles in this lightweight harness.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const hook = useOrderStatusTransition({
    orderId: 'order-1',
    currentStatus: 'preparing',
    createdAt: '2020-01-01T00:00:00Z',
    onStatusChange,
  })
  hook.handleForwardAction()
  return { onStatusChange, setOptimisticStatus: setters[1] }
}

function startCompletion(response: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
  const onStatusChange = vi.fn()
  // A fresh order would trip the ready warning if completion were a Ready action.
  // React hooks are replaced with test doubles in this lightweight harness.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const hook = useOrderStatusTransition({
    orderId: 'order-1',
    currentStatus: 'ready',
    createdAt: new Date().toISOString(),
    source: 'counter',
    deliveryType: 'self_pickup',
    onStatusChange,
  })
  hook.handleForwardAction()
  return { onStatusChange, setOptimisticStatus: setters[1], modal: hook.modal }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  setters.length = 0
})

describe('status transition response', () => {
  it('reconciles a ready request with the delivered status returned by the server', async () => {
    const { onStatusChange, setOptimisticStatus } = startTransition({
      ok: true, json: async () => ({ success: true, status: 'delivered' }),
    })
    expect(setOptimisticStatus).toHaveBeenCalledWith('ready')
    await vi.waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('delivered'))
    expect(setOptimisticStatus).toHaveBeenLastCalledWith('delivered')
    expect(addToast).toHaveBeenCalledWith({ type: 'success', title: 'Order marked as Delivered' })
  })

  it.each([
    ['missing status', async () => ({ success: true })],
    ['invalid status', async () => ({ status: 'bogus' })],
    ['malformed JSON', async () => { throw new SyntaxError('bad JSON') }],
  ])('falls back to the requested status for %s', async (_label, json) => {
    const { onStatusChange, setOptimisticStatus } = startTransition({ ok: true, json })
    await vi.waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('ready'))
    expect(setOptimisticStatus).toHaveBeenLastCalledWith('ready')
    expect(addToast).toHaveBeenCalledWith({ type: 'success', title: 'Order marked as Ready' })
  })

  it('rolls back and reports the server error on a failed response', async () => {
    const { onStatusChange, setOptimisticStatus } = startTransition({
      ok: false, status: 409, json: async () => ({ error: 'Order changed' }),
    })
    await vi.waitFor(() => expect(addToast).toHaveBeenCalledWith({
      type: 'error', title: 'Status update failed', description: 'Order changed',
    }))
    expect(setOptimisticStatus).toHaveBeenLastCalledWith(null)
    expect(onStatusChange).not.toHaveBeenCalled()
  })
})

describe('counter take-away completion', () => {
  it('completes a ready counter take-away without the ready warning', async () => {
    const { onStatusChange, setOptimisticStatus, modal } = startCompletion({
      ok: true, json: async () => ({ success: true, status: 'delivered' }),
    })
    expect(modal).toBeNull()
    expect(setOptimisticStatus).toHaveBeenCalledWith('delivered')
    await vi.waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('delivered'))
    expect(addToast).toHaveBeenCalledWith({ type: 'success', title: 'Order marked as Delivered' })
  })

  it('offers no completion action without the counter take-away context', () => {
    vi.stubGlobal('fetch', vi.fn())
    // React hooks are replaced with test doubles in this lightweight harness.
     
    const hook = useOrderStatusTransition({
      orderId: 'order-1',
      currentStatus: 'ready',
      createdAt: new Date().toISOString(),
    })
    expect(hook.primaryAction).toBeNull()
  })
})
