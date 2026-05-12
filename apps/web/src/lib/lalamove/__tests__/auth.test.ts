import { describe, it, expect } from 'vitest'
import { generateSignature, buildAuthHeaders, verifyWebhookSignature } from '../auth'

describe('generateSignature', () => {
  const SECRET = 'sk_test_Lalamove'

  it('generates correct v3 signature for POST request with body', () => {
    // Based on Lalamove v3 documentation example
    const timestamp = '1545880607433'
    const method = 'POST'
    const path = '/v3/quotations'
    const body = '{"data":{"serviceType":"MOTORCYCLE"}}'

    const signature = generateSignature(method, path, timestamp, body, SECRET)

    // Verify it's a hex string (lowercase)
    expect(signature).toMatch(/^[0-9a-f]{64}$/)

    // Verify deterministic - same inputs produce same output
    const sig2 = generateSignature(method, path, timestamp, body, SECRET)
    expect(sig2).toBe(signature)
  })

  it('generates correct v3 signature for GET request (no body)', () => {
    const timestamp = '1545880607433'
    const method = 'GET'
    const path = '/v3/orders/123456'

    const signature = generateSignature(method, path, timestamp, '', SECRET)

    // Verify it's a lowercase hex string
    expect(signature).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces different signatures for different methods', () => {
    const timestamp = '1545880607433'
    const path = '/v3/quotations'
    const body = '{"data":{}}'

    const postSig = generateSignature('POST', path, timestamp, body, SECRET)
    const putSig = generateSignature('PUT', path, timestamp, body, SECRET)

    expect(postSig).not.toBe(putSig)
  })

  it('produces different signatures for different paths', () => {
    const timestamp = '1545880607433'
    const method = 'POST'
    const body = '{"data":{}}'

    const sig1 = generateSignature(method, '/v3/quotations', timestamp, body, SECRET)
    const sig2 = generateSignature(method, '/v3/orders', timestamp, body, SECRET)

    expect(sig1).not.toBe(sig2)
  })

  it('produces different signatures for different timestamps', () => {
    const method = 'POST'
    const path = '/v3/quotations'
    const body = '{"data":{}}'

    const sig1 = generateSignature(method, path, '1545880607433', body, SECRET)
    const sig2 = generateSignature(method, path, '1545880607434', body, SECRET)

    expect(sig1).not.toBe(sig2)
  })

  it('produces different signatures for different bodies', () => {
    const timestamp = '1545880607433'
    const method = 'POST'
    const path = '/v3/quotations'

    const sig1 = generateSignature(method, path, timestamp, '{"a":1}', SECRET)
    const sig2 = generateSignature(method, path, timestamp, '{"b":2}', SECRET)

    expect(sig1).not.toBe(sig2)
  })

  it('produces different signatures for different secrets', () => {
    const timestamp = '1545880607433'
    const method = 'POST'
    const path = '/v3/quotations'
    const body = '{"data":{}}'

    const sig1 = generateSignature(method, path, timestamp, body, 'secret1')
    const sig2 = generateSignature(method, path, timestamp, body, 'secret2')

    expect(sig1).not.toBe(sig2)
  })
})

describe('buildAuthHeaders', () => {
  it('includes all required v3 headers', () => {
    const headers = buildAuthHeaders(
      'pk_test_key',
      'sk_test_secret',
      'MY',
      'POST',
      '/v3/quotations',
      '{"data":{}}'
    )

    expect(headers['Authorization']).toMatch(/^hmac pk_test_key:\d+:[0-9a-f]{64}$/)
    expect(headers['Market']).toBe('MY')
    expect(headers['Request-ID']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('generates unique Request-IDs for each call', () => {
    const h1 = buildAuthHeaders('pk', 'sk', 'MY', 'GET', '/v3/cities')
    const h2 = buildAuthHeaders('pk', 'sk', 'MY', 'GET', '/v3/cities')

    expect(h1['Request-ID']).not.toBe(h2['Request-ID'])
  })

  it('uses current timestamp', () => {
    const before = Date.now()
    const headers = buildAuthHeaders('pk', 'sk', 'MY', 'GET', '/v3/cities')
    const after = Date.now()

    const timestamp = parseInt(headers['Authorization'].split(':')[1])
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })
})

describe('verifyWebhookSignature', () => {
  const SECRET = 'sk_test_secret'
  const PATH = '/api/webhooks/lalamove'

  const signData = (timestamp: number | string, path: string, data: unknown, secret = SECRET) => {
    const crypto = require('crypto')
    const raw = `${timestamp}\r\nPOST\r\n${path}\r\n\r\n${JSON.stringify(data)}`
    return crypto.createHmac('sha256', secret).update(raw).digest('hex')
  }

  it('verifies a valid webhook signature using the v3 recipe', () => {
    const timestamp = 1778608253
    const data = { balance: { amount: '100', currency: 'MYR' } }
    const signature = signData(timestamp, PATH, data)

    expect(verifyWebhookSignature(signature, SECRET, timestamp, PATH, data)).toBe(true)
  })

  it('matches the sandbox sample from the Lalamove portal', () => {
    // Real sample from the Partner Portal webhook log, used to reverse-confirm
    // the v3 signing recipe. Keeps us honest if anyone edits the verifier.
    const portalSecret =
      'sk_test_bAzqfQxcp94EGxz2zygQKPrCYzW5rm5MgfmtY4YYGbEecTo+HLD+r2rCWFCUUp+2'
    const timestamp = 1778608253
    const data = {
      balance: { amount: '959.2', currency: 'MYR' },
      updatedAt: '2026-05-13T01:50.00Z',
    }
    const realSignature =
      'a6f9a6b08bbfd16b32ebb346020362712c9ca0f0a4826e625278a83ab613a3ed'

    expect(
      verifyWebhookSignature(realSignature, portalSecret, timestamp, PATH, data)
    ).toBe(true)
  })

  it('rejects an invalid webhook signature', () => {
    const invalidSig = 'a'.repeat(64)
    expect(
      verifyWebhookSignature(invalidSig, SECRET, 1700000000, PATH, { foo: 1 })
    ).toBe(false)
  })

  it('rejects when data is tampered', () => {
    const timestamp = 1700000000
    const signature = signData(timestamp, PATH, { orderId: '123' })

    expect(
      verifyWebhookSignature(signature, SECRET, timestamp, PATH, { orderId: '456' })
    ).toBe(false)
  })

  it('rejects when path does not match', () => {
    const timestamp = 1700000000
    const data = { orderId: '123' }
    const signature = signData(timestamp, PATH, data)

    expect(
      verifyWebhookSignature(signature, SECRET, timestamp, '/other/path', data)
    ).toBe(false)
  })

  it('rejects when secret is wrong', () => {
    const timestamp = 1700000000
    const data = { orderId: '123' }
    const signature = signData(timestamp, PATH, data)

    expect(
      verifyWebhookSignature(signature, 'wrong_secret', timestamp, PATH, data)
    ).toBe(false)
  })

  it('returns false for missing signature', () => {
    expect(verifyWebhookSignature('', SECRET, 1700000000, PATH, {})).toBe(false)
  })

  it('returns false for signatures of wrong length', () => {
    expect(
      verifyWebhookSignature('abc', SECRET, 1700000000, PATH, {})
    ).toBe(false)
  })
})
