import { describe, it, expect, vi, beforeEach } from 'vitest'

const envMock = vi.hoisted(() => ({
  PRINT_BRIDGE_SECRET: 'bridge-secret' as string | undefined,
  NEXT_PUBLIC_PRINT_BRIDGE_TOKEN: undefined as string | undefined,
}))
vi.mock('@/lib/validators/env', () => ({ env: envMock }))

const { isBridgeRequest } = await import('../bridge-auth')

beforeEach(() => {
  envMock.PRINT_BRIDGE_SECRET = 'bridge-secret'
  envMock.NEXT_PUBLIC_PRINT_BRIDGE_TOKEN = undefined
  vi.restoreAllMocks()
})

describe('isBridgeRequest', () => {
  it('accepts the exact bearer token', () => {
    expect(isBridgeRequest('Bearer bridge-secret')).toBe(true)
  })

  it('rejects a wrong secret of the same length', () => {
    expect(isBridgeRequest('Bearer bridge-secreX')).toBe(false)
  })

  it('rejects a correct prefix of the secret', () => {
    expect(isBridgeRequest('Bearer bridge-secre')).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(isBridgeRequest(null)).toBe(false)
  })

  it('rejects when no secret is configured', () => {
    envMock.PRINT_BRIDGE_SECRET = undefined
    expect(isBridgeRequest('Bearer bridge-secret')).toBe(false)
  })

  it('rejects a bare secret without the Bearer prefix', () => {
    expect(isBridgeRequest('bridge-secret')).toBe(false)
  })

  it('fails closed when the secret equals the public bridge token', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    envMock.NEXT_PUBLIC_PRINT_BRIDGE_TOKEN = 'bridge-secret'

    expect(isBridgeRequest('Bearer bridge-secret')).toBe(false)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('NEXT_PUBLIC_PRINT_BRIDGE_TOKEN'))
  })
})
