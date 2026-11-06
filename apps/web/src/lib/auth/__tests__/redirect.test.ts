import { describe, expect, it } from 'vitest'
import { isValidRedirect } from '../redirect'

describe('isValidRedirect', () => {
  it('accepts same-origin relative paths, including query and hash', () => {
    for (const ok of ['/', '/orders', '/orders?tab=active', '/checkout?utm_source=email', '/auth#reset']) {
      expect(isValidRedirect(ok), ok).toBe(true)
    }
  })

  it('treats a missing redirect as invalid', () => {
    expect(isValidRedirect(null)).toBe(false)
    expect(isValidRedirect('')).toBe(false)
  })

  it('rejects absolute and protocol-relative URLs', () => {
    for (const bad of ['https://evil.example', 'http://evil.example', '//evil.example', '\\\\evil.example']) {
      expect(isValidRedirect(bad), bad).toBe(false)
    }
  })

  it('rejects mixed-slash protocol-relative URLs via the origin check', () => {
    // WHATWG URL parsing treats '\' as '/' for special schemes, so this
    // resolves against a foreign origin even though it starts with '/'.
    expect(new URL('/\\evil.example', 'http://localhost').host).toBe('evil.example')
    expect(isValidRedirect('/\\evil.example')).toBe(false)
  })

  it('rejects paths that are not rooted', () => {
    expect(isValidRedirect('orders')).toBe(false)
    expect(isValidRedirect('../..')).toBe(false)
  })
})
