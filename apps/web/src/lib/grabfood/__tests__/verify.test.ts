import { afterEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS = [
  'GRABFOOD_ENV',
  'GRABFOOD_ENABLED',
  'GRABFOOD_WEBHOOK_SECRET',
  'GRABFOOD_WEBHOOK_SIGNATURE_HEADER',
] as const

const original: Record<string, string | undefined> = {}
for (const key of ENV_KEYS) original[key] = process.env[key]
const originalSkip = process.env.SKIP_ENV_VALIDATION

async function loadVerify(
  overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>,
): Promise<typeof import('../verify')> {
  vi.resetModules()
  for (const key of ENV_KEYS) delete process.env[key]
  process.env.SKIP_ENV_VALIDATION = 'true'
  Object.assign(process.env, overrides)
  return import('../verify')
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  if (originalSkip === undefined) delete process.env.SKIP_ENV_VALIDATION
  else process.env.SKIP_ENV_VALIDATION = originalSkip
})

describe('GrabFood webhook signature verification', () => {
  it('accepts requests in explicit mock mode when no secret is configured', async () => {
    const { verifyWebhookSignature } = await loadVerify({ GRABFOOD_ENV: 'mock' })
    expect(verifyWebhookSignature('{}', null)).toBe(true)
  })

  it('fails closed in staging/production when the secret is not configured', async () => {
    for (const grabEnv of ['staging', 'production']) {
      const { verifyWebhookSignature } = await loadVerify({ GRABFOOD_ENV: grabEnv })
      expect(verifyWebhookSignature('{}', null)).toBe(false)
    }
  })

  it('fails closed in a production process even when GRABFOOD_ENV is mock', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { verifyWebhookSignature } = await loadVerify({ GRABFOOD_ENV: 'mock' })
    expect(verifyWebhookSignature('{}', null)).toBe(false)
  })

  it('accepts a valid HMAC-SHA256 signature over the raw body', async () => {
    const secret = 'shared-secret'
    const { verifyWebhookSignature, computeSignature } = await loadVerify({
      GRABFOOD_ENV: 'production',
      GRABFOOD_WEBHOOK_SECRET: secret,
    })
    const body = '{"orderID":"abc"}'
    expect(verifyWebhookSignature(body, computeSignature(body, secret))).toBe(true)
    // sha256= prefix (some providers) is tolerated.
    expect(verifyWebhookSignature(body, 'sha256=' + computeSignature(body, secret))).toBe(true)
  })

  it('rejects a missing or tampered signature', async () => {
    const { verifyWebhookSignature, computeSignature } = await loadVerify({
      GRABFOOD_ENV: 'production',
      GRABFOOD_WEBHOOK_SECRET: 'shared-secret',
    })
    expect(verifyWebhookSignature('{"orderID":"abc"}', null)).toBe(false)
    expect(verifyWebhookSignature('{"orderID":"abc"}', 'deadbeef')).toBe(false)
    const valid = computeSignature('{"orderID":"abc"}', 'shared-secret')
    expect(verifyWebhookSignature('{"orderID":"tampered"}', valid)).toBe(false)
  })

  it('honours GRABFOOD_WEBHOOK_SIGNATURE_HEADER', async () => {
    const { getSignatureHeaderName } = await loadVerify({
      GRABFOOD_WEBHOOK_SIGNATURE_HEADER: 'X-Grab-Signature',
    })
    expect(getSignatureHeaderName()).toBe('x-grab-signature')

    const custom = await loadVerify({ GRABFOOD_WEBHOOK_SIGNATURE_HEADER: 'X-Custom-Sig' })
    expect(custom.getSignatureHeaderName()).toBe('x-custom-sig')
  })
})
