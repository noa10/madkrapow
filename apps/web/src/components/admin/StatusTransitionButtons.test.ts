import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { StatusTransitionButtons } from './StatusTransitionButtons'

const { getCachedAdminAuth, getAdminAuth, subscribeAdminAuth, role, setters } = vi.hoisted(() => ({
  role: { current: 'manager' },
  getCachedAdminAuth: vi.fn(),
  getAdminAuth: vi.fn(),
  subscribeAdminAuth: vi.fn(),
  setters: [] as ReturnType<typeof vi.fn>[],
}))

vi.mock('@/lib/admin/role-cache', () => ({ getCachedAdminAuth, getAdminAuth, subscribeAdminAuth }))
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const setter = vi.fn()
    setters.push(setter)
    return [typeof initial === 'function' ? initial() : initial, setter]
  },
  useCallback: (callback: unknown) => callback,
  // Run the effect so the role subscription under test is actually exercised.
  useEffect: (effect: () => void | (() => void)) => { effect() },
}))

function findButton(node: ReactNode, label: string): ReactElement<{ onClick: () => unknown }> | undefined {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => unknown }>(node)) return undefined
  if (node.props.onClick && Children.toArray(node.props.children).includes(label)) {
    return node as ReactElement<{ onClick: () => unknown }>
  }
  return Children.toArray(node.props.children)
    .map((child) => findButton(child, label))
    .find((child) => child !== undefined)
}

function render(currentStatus = 'paid', isGrabFood = true, onStatusUpdate = vi.fn()) {
  getCachedAdminAuth.mockReturnValue({ role: role.current })
  return StatusTransitionButtons({ orderId: 'order-1', currentStatus, isGrabFood, onStatusUpdate })
}

const label = 'Already marked ready in Grab'

beforeEach(() => {
  getAdminAuth.mockResolvedValue({ role: role.current })
  subscribeAdminAuth.mockReturnValue(vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  role.current = 'manager'
  setters.length = 0
})

describe('GrabFood local readiness confirmation', () => {
  it.each(['paid', 'preparing'])('offers confirmation for an eligible GrabFood order in %s', (status) => {
    expect(findButton(render(status), label)).toBeDefined()
  })

  it.each(['pending', 'ready', 'picked_up', 'delivered', 'cancelled'])('does not offer confirmation in %s', (status) => {
    expect(findButton(render(status), label)).toBeUndefined()
  })

  it('hides confirmation for non-GrabFood orders and non-managerial staff', () => {
    expect(findButton(render('preparing', false), label)).toBeUndefined()
    role.current = 'cashier'
    expect(findButton(render('preparing'), label)).toBeUndefined()
  })

  it('only sends the explicit local-only request after confirmation', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('window', { confirm })
    const onStatusUpdate = vi.fn()
    const button = findButton(render('paid', true, onStatusUpdate), label)
    expect(button).toBeDefined()

    await button?.props.onClick()
    expect(fetch).not.toHaveBeenCalled()
    await button?.props.onClick()

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('will not notify Grab'))
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/admin/orders/order-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready', alreadyMarkedReadyInGrab: true }),
    })
    expect(onStatusUpdate).toHaveBeenCalledWith('ready')
  })

  it('subscribes to the live role only for GrabFood orders', () => {
    getAdminAuth.mockResolvedValue({ role: 'manager' })
    subscribeAdminAuth.mockReturnValue(vi.fn())
    render('preparing', true)
    expect(subscribeAdminAuth).toHaveBeenCalledTimes(1)
    expect(getAdminAuth).toHaveBeenCalledTimes(1)

    subscribeAdminAuth.mockClear()
    getAdminAuth.mockClear()
    render('preparing', false)
    expect(subscribeAdminAuth).not.toHaveBeenCalled()
    expect(getAdminAuth).not.toHaveBeenCalled()
  })

  it('keeps the ordinary Mark Ready request unchanged', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetch)
    await findButton(render('preparing'), 'Mark Ready')?.props.onClick()
    expect(fetch).toHaveBeenCalledWith('/api/admin/orders/order-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' }),
    })
  })
})
