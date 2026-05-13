import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateOrderDisplayCode, getKualaLumpurDateString } from '../generator'
import { InMemoryOrderDisplayCodeStore } from '../store-memory'

const CODE_RE = /^MK-\d{3,}$/

describe('generateOrderDisplayCode', () => {
  let store: InMemoryOrderDisplayCodeStore

  beforeEach(() => {
    store = new InMemoryOrderDisplayCodeStore()
  })

  it('returns MK-### base format (3 digits, zero-padded)', async () => {
    const code = await generateOrderDisplayCode(store)
    expect(code).toMatch(/^MK-\d{3}$/)
    expect(code.length).toBe(6)
  })

  it('zero-pads to the current digit length', async () => {
    // Force low random values to verify padding: n = 0, n = 7
    const values = [0, 0.0007] // floor(0 * 1000) = 0; floor(0.0007 * 1000) = 0 -> collides, but we only use the first
    let i = 0
    const random = () => values[i++ % values.length]
    const code = await generateOrderDisplayCode(store, { random })
    expect(code).toBe('MK-000')
  })

  it('produces unique codes under 100 concurrent calls for the same day', async () => {
    const results = await Promise.all(
      Array.from({ length: 100 }, () => generateOrderDisplayCode(store)),
    )
    const unique = new Set(results)
    expect(unique.size).toBe(100)
    for (const code of results) expect(code).toMatch(CODE_RE)
  })

  it('allows the same code on different days', async () => {
    // Force a deterministic code by rigging random → 0
    const random = () => 0
    const day1 = new Date('2026-05-12T10:00:00+08:00')
    const day2 = new Date('2026-05-13T10:00:00+08:00')

    const code1 = await generateOrderDisplayCode(store, { random, date: day1 })
    const code2 = await generateOrderDisplayCode(store, { random, date: day2 })

    expect(code1).toBe('MK-000')
    expect(code2).toBe('MK-000')
    expect(getKualaLumpurDateString(day1)).not.toBe(getKualaLumpurDateString(day2))
  })

  it('expands to 4 digits when the 3-digit pool is exhausted for the day', async () => {
    const date = new Date('2026-05-12T10:00:00+08:00')
    const dateString = getKualaLumpurDateString(date)
    store.seedSequential(dateString, 3, 1000) // MK-000 … MK-999

    const onExpand = vi.fn()
    const code = await generateOrderDisplayCode(store, { date, onExpand })

    expect(code).toMatch(/^MK-\d{4}$/)
    expect(code.length).toBe(7)
    expect(onExpand).toHaveBeenCalledWith({
      dateString,
      oldLength: 3,
      newLength: 4,
    })
  })

  it('expands to 5 digits when both 3- and 4-digit pools are full', async () => {
    const date = new Date('2026-05-12T10:00:00+08:00')
    const dateString = getKualaLumpurDateString(date)
    store.seedSequential(dateString, 3, 1000)
    store.seedSequential(dateString, 4, 10000)

    const onExpand = vi.fn()
    const code = await generateOrderDisplayCode(store, { date, onExpand })

    expect(code).toMatch(/^MK-\d{5}$/)
    expect(code.length).toBe(8)
    expect(onExpand).toHaveBeenCalledWith({
      dateString,
      oldLength: 3,
      newLength: 4,
    })
    expect(onExpand).toHaveBeenCalledWith({
      dateString,
      oldLength: 4,
      newLength: 5,
    })
  })

  it('resets to 3 digits on a new KL day even after prior-day expansion', async () => {
    const yesterday = new Date('2026-05-11T10:00:00+08:00')
    const yesterdayString = getKualaLumpurDateString(yesterday)
    store.seedSequential(yesterdayString, 3, 1000)
    await generateOrderDisplayCode(store, { date: yesterday }) // triggers expansion

    const today = new Date('2026-05-12T10:00:00+08:00')
    const code = await generateOrderDisplayCode(store, { date: today })
    expect(code).toMatch(/^MK-\d{3}$/)
  })

  it('uses the KL calendar date, not UTC', async () => {
    // 2026-05-12T23:30:00Z is 2026-05-13 07:30 in KL.
    const utcLateNight = new Date('2026-05-12T23:30:00Z')
    expect(getKualaLumpurDateString(utcLateNight)).toBe('2026-05-13')
  })

  it('does not reserve a code until one is actually claimed', async () => {
    const date = new Date('2026-05-12T10:00:00+08:00')
    const dateString = getKualaLumpurDateString(date)
    await generateOrderDisplayCode(store, { date })
    expect(await store.countUsed(dateString, 3)).toBe(1)
  })
})
