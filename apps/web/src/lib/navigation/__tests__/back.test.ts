import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getNavigationSteps, recordNavigation, resetNavigationSteps, shouldGoBack } from '../back'

const NAV_STEPS_KEY = 'mkp:nav-steps'

function createSessionStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    },
  }
}

describe('shouldGoBack', () => {
  it('only goes back when at least one in-app step was recorded', () => {
    expect(shouldGoBack(0)).toBe(false)
    expect(shouldGoBack(1)).toBe(true)
    expect(shouldGoBack(5)).toBe(true)
  })

  it('does not go back for negative or non-numeric counts', () => {
    expect(shouldGoBack(-1)).toBe(false)
    expect(shouldGoBack(Number.NaN)).toBe(false)
  })
})

describe('in-app navigation counter', () => {
  let storage: Storage

  beforeEach(() => {
    storage = createSessionStorage()
    vi.stubGlobal('window', { sessionStorage: storage })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts at zero for a fresh tab session', () => {
    expect(getNavigationSteps()).toBe(0)
  })

  it('records each navigation under one namespaced tab-scoped key', () => {
    expect(recordNavigation()).toBe(1)
    expect(recordNavigation()).toBe(2)
    expect(storage.getItem(NAV_STEPS_KEY)).toBe('2')
    expect(getNavigationSteps()).toBe(2)
  })

  it('reads a count recorded earlier in the same tab session', () => {
    storage.setItem(NAV_STEPS_KEY, '3')

    expect(getNavigationSteps()).toBe(3)
  })

  it('resets the counter for a fresh document load', () => {
    recordNavigation()
    recordNavigation()
    expect(getNavigationSteps()).toBe(2)

    resetNavigationSteps()

    expect(getNavigationSteps()).toBe(0)
    expect(storage.getItem(NAV_STEPS_KEY)).toBe('0')
  })

  it('reset degrades silently when storage is unavailable', () => {
    vi.stubGlobal('window', undefined)
    expect(() => resetNavigationSteps()).not.toThrow()
    expect(getNavigationSteps()).toBe(0)
  })

  it('supports a bare sessionStorage global outside a window', () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('sessionStorage', storage)

    expect(recordNavigation()).toBe(1)
    expect(getNavigationSteps()).toBe(1)
  })

  it('ignores corrupt or negative stored values', () => {
    storage.setItem(NAV_STEPS_KEY, 'not-a-number')
    expect(getNavigationSteps()).toBe(0)

    storage.setItem(NAV_STEPS_KEY, '-2')
    expect(getNavigationSteps()).toBe(0)
  })

  it('degrades to zero when window/sessionStorage is unavailable', () => {
    vi.stubGlobal('window', undefined)

    expect(getNavigationSteps()).toBe(0)
    expect(recordNavigation()).toBe(0)
  })

  it('degrades to zero when sessionStorage access throws', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('access denied')
      },
    })

    expect(getNavigationSteps()).toBe(0)
    expect(recordNavigation()).toBe(0)
  })

  it('degrades to zero when sessionStorage methods throw', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem() {
          throw new Error('access denied')
        },
        setItem() {
          throw new Error('access denied')
        },
      },
    })

    expect(getNavigationSteps()).toBe(0)
    expect(recordNavigation()).toBe(0)
  })
})
