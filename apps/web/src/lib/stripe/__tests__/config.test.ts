import { describe, expect, it } from 'vitest'
import { evaluateStripeConfig, type StripeConfigInput } from '../config'

const liveConfig: StripeConfigInput = {
  enabled: true,
  secretKey: 'sk_live_example',
  publishableKey: 'pk_live_example',
  webhookSecret: 'whsec_live_example',
  deploymentEnvironment: 'production',
}

describe('evaluateStripeConfig', () => {
  it('accepts a live key pair in production', () => {
    expect(evaluateStripeConfig(liveConfig)).toEqual({
      available: true,
      mode: 'live',
      reason: null,
    })
  })

  it('accepts a test key pair outside production', () => {
    expect(
      evaluateStripeConfig({
        ...liveConfig,
        secretKey: 'sk_test_example',
        publishableKey: 'pk_test_example',
        deploymentEnvironment: 'preview',
      }),
    ).toEqual({ available: true, mode: 'test', reason: null })
  })

  it('rejects a test secret paired with a live publishable key', () => {
    const result = evaluateStripeConfig({
      ...liveConfig,
      secretKey: 'sk_test_example',
    })

    expect(result.available).toBe(false)
    expect(result.mode).toBe('mixed')
    expect(result.reason).toContain('secret is test')
    expect(result.reason).toContain('publishable is live')
  })

  it('rejects test keys in production', () => {
    const result = evaluateStripeConfig({
      ...liveConfig,
      secretKey: 'sk_test_example',
      publishableKey: 'pk_test_example',
    })

    expect(result.available).toBe(false)
    expect(result.reason).toBe('Stripe is in test mode in production')
  })

  it('rejects live keys outside production', () => {
    const result = evaluateStripeConfig({
      ...liveConfig,
      deploymentEnvironment: 'preview',
    })

    expect(result.available).toBe(false)
    expect(result.reason).toBe('Live Stripe keys are not allowed outside production')
  })

  it('rejects an incomplete key pair', () => {
    expect(
      evaluateStripeConfig({ ...liveConfig, publishableKey: undefined }),
    ).toMatchObject({ available: false, mode: 'missing' })
  })

  it('rejects keys with an unrecognised prefix', () => {
    expect(
      evaluateStripeConfig({ ...liveConfig, secretKey: 'sk_unknown' }),
    ).toMatchObject({ available: false, mode: 'unknown' })
  })

  it('rejects a missing webhook secret', () => {
    const result = evaluateStripeConfig({ ...liveConfig, webhookSecret: undefined })

    expect(result.available).toBe(false)
    expect(result.reason).toBe('Stripe webhook secret is missing')
  })

  it('rejects a disabled gateway even when the keys are valid', () => {
    expect(evaluateStripeConfig({ ...liveConfig, enabled: false })).toMatchObject({
      available: false,
      reason: 'Stripe is disabled',
    })
  })
})
