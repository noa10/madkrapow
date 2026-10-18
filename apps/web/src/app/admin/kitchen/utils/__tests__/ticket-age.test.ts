import { describe, it, expect } from 'vitest'
import {
  ticketAge,
  formatElapsed,
  AGING_AFTER_MINUTES,
  OVERDUE_AFTER_MINUTES,
} from '../ticket-age'

const NOW = new Date('2026-10-17T19:42:00Z')

/** `seconds` before NOW, as an ISO string like the DB returns. */
function agoIso(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString()
}

describe('formatElapsed', () => {
  it('says "Just now" under five seconds', () => {
    expect(formatElapsed(agoIso(4), NOW)).toBe('Just now')
  })

  it('counts seconds under a minute', () => {
    expect(formatElapsed(agoIso(30), NOW)).toBe('30s ago')
  })

  it('rolls over to minutes exactly at a minute', () => {
    expect(formatElapsed(agoIso(60), NOW)).toBe('1 min ago')
  })

  it('counts minutes under an hour', () => {
    expect(formatElapsed(agoIso(12 * 60), NOW)).toBe('12 min ago')
  })

  it('counts hours under a day', () => {
    expect(formatElapsed(agoIso(3 * 3600), NOW)).toBe('3h ago')
  })

  it('counts days under thirty', () => {
    expect(formatElapsed(agoIso(2 * 86400), NOW)).toBe('2d ago')
  })

  it('counts months beyond thirty days', () => {
    expect(formatElapsed(agoIso(65 * 86400), NOW)).toBe('2mo ago')
  })

  it('accepts a Date as well as an ISO string', () => {
    const createdAt = new Date(NOW.getTime() - 12 * 60 * 1000)
    expect(formatElapsed(createdAt, NOW)).toBe('12 min ago')
  })
})

describe('ticketAge', () => {
  it('is fresh below the aging threshold', () => {
    expect(ticketAge(agoIso((AGING_AFTER_MINUTES - 1) * 60), NOW)).toBe('fresh')
  })

  it('is aging exactly at the aging threshold', () => {
    expect(ticketAge(agoIso(AGING_AFTER_MINUTES * 60), NOW)).toBe('aging')
  })

  it('is still aging just below the overdue threshold', () => {
    expect(ticketAge(agoIso((OVERDUE_AFTER_MINUTES - 1) * 60), NOW)).toBe(
      'aging'
    )
  })

  it('is overdue exactly at the overdue threshold', () => {
    expect(ticketAge(agoIso(OVERDUE_AFTER_MINUTES * 60), NOW)).toBe('overdue')
  })

  it('stays overdue for a very old ticket', () => {
    expect(ticketAge(agoIso(90 * 60), NOW)).toBe('overdue')
  })
})
