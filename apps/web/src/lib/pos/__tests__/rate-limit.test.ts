import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSlidingWindowLimiter } from '../rate-limit'

describe('createSlidingWindowLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows up to the limit inside the window and rejects after it', () => {
    const limiter = createSlidingWindowLimiter(3, 1000)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })

  it('isolates keys from each other', () => {
    const limiter = createSlidingWindowLimiter(1, 1000)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('b')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
    expect(limiter.allow('b')).toBe(false)
  })

  it('forgets calls once the window has passed', () => {
    const limiter = createSlidingWindowLimiter(1, 1000)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)

    vi.advanceTimersByTime(1001)

    expect(limiter.allow('a')).toBe(true)
  })

  it('bounds the key map, evicting the oldest key', () => {
    // A flood of unique random tokens must not grow the map without limit.
    const limiter = createSlidingWindowLimiter(1, 60_000, 2)
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('b')).toBe(true)
    expect(limiter.allow('c')).toBe(true) // evicts 'a'

    // 'a' was forgotten, so it starts a fresh window; without eviction it
    // would still be at its limit and this would be false.
    expect(limiter.allow('a')).toBe(true)
  })
})
