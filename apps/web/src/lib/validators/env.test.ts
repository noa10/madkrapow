import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('GrabFood environment normalization', () => {
  it('parses flags and token expiry when general validation is skipped', async () => {
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
    vi.stubEnv('GRABFOOD_ENV', 'staging')
    vi.stubEnv('GRABFOOD_ENABLED', 'true')
    vi.stubEnv('GRABFOOD_WEBHOOK_HMAC_REQUIRED', 'false')
    vi.stubEnv('GRABFOOD_PARTNER_TOKEN_TTL_SECONDS', '3600')
    const { env } = await import('./env')
    expect(env.GRABFOOD_ENABLED).toBe(true)
    expect(env.GRABFOOD_WEBHOOK_HMAC_REQUIRED).toBe(false)
    expect(env.GRABFOOD_PARTNER_TOKEN_TTL_SECONDS).toBe(3600)
  })

  it('defaults to disabled without enabling HMAC when validation is skipped', async () => {
    vi.stubEnv('SKIP_ENV_VALIDATION', 'true')
    for (const key of ['GRABFOOD_ENABLED', 'GRABFOOD_ENV', 'GRABFOOD_WEBHOOK_HMAC_REQUIRED', 'GRABFOOD_PARTNER_TOKEN_TTL_SECONDS']) {
      vi.stubEnv(key, undefined)
    }
    const { env } = await import('./env')
    expect(env.GRABFOOD_ENABLED).toBe(false)
    expect(env.GRABFOOD_ENV).toBe('mock')
    expect(env.GRABFOOD_WEBHOOK_HMAC_REQUIRED).toBe(false)
    expect(env.GRABFOOD_PARTNER_TOKEN_TTL_SECONDS).toBe(604800)
  })

  it('normalizes GrabFood settings despite an unrelated validation failure', async () => {
    vi.stubEnv('SKIP_ENV_VALIDATION', 'false')
    vi.stubEnv('BILLPLZ_ENV', 'not-an-environment')
    vi.stubEnv('GRABFOOD_ENABLED', 'true')
    vi.stubEnv('GRABFOOD_ENV', 'staging')
    vi.stubEnv('GRABFOOD_WEBHOOK_HMAC_REQUIRED', 'false')
    vi.stubEnv('STRIPE_SECRET_KEY', undefined)
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { env } = await import('./env')
      expect(env.GRABFOOD_ENABLED).toBe(true)
      expect(env.GRABFOOD_WEBHOOK_HMAC_REQUIRED).toBe(false)
    } finally {
      log.mockRestore()
    }
  })
})
