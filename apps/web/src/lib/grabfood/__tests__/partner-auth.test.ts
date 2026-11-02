import { afterEach, describe, expect, it, vi } from 'vitest'

const KEYS = [
  'GRABFOOD_ENV',
  'GRABFOOD_ENABLED',
  'GRABFOOD_PARTNER_CLIENT_ID',
  'GRABFOOD_PARTNER_CLIENT_SECRET',
  'GRABFOOD_PARTNER_TOKEN_SECRET',
  'GRABFOOD_PARTNER_TOKEN_TTL_SECONDS',
  'GRABFOOD_WEBHOOK_SECRET',
  'GRABFOOD_WEBHOOK_HMAC_REQUIRED',
] as const

const original: Record<string, string | undefined> = {}
for (const key of KEYS) original[key] = process.env[key]
const originalSkip = process.env.SKIP_ENV_VALIDATION

async function loadAuth(overrides: Partial<Record<(typeof KEYS)[number], string>>) {
  vi.resetModules()
  for (const key of KEYS) delete process.env[key]
  process.env.SKIP_ENV_VALIDATION = 'true'
  Object.assign(process.env, overrides)
  return import('../partner-auth')
}

function headers(init: Record<string, string> = {}): Headers {
  return new Headers(init)
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
  if (originalSkip === undefined) delete process.env.SKIP_ENV_VALIDATION
  else process.env.SKIP_ENV_VALIDATION = originalSkip
})

const STAGING = {
  GRABFOOD_ENV: 'staging',
  GRABFOOD_ENABLED: 'true',
  GRABFOOD_PARTNER_CLIENT_ID: 'pos-client',
  GRABFOOD_PARTNER_CLIENT_SECRET: 'pos-secret',
  GRABFOOD_PARTNER_TOKEN_SECRET: 'a-separate-signing-secret',
} as const

describe('partner OAuth tokens', () => {
  it('issues a token that verifies with the configured scope', async () => {
    const auth = await loadAuth(STAGING)
    const issued = auth.issuePartnerToken()
    expect(issued.token_type).toBe('Bearer')
    expect(issued.expires_in).toBe(604800)

    const verified = auth.verifyPartnerToken(issued.access_token)
    expect(verified.ok).toBe(true)
    if (!verified.ok) return
    expect(verified.payload.scope).toContain('food.partner_api')
    expect(verified.payload.sub).toBe('pos-client')
  })

  it('rejects a tampered token', async () => {
    const auth = await loadAuth(STAGING)
    const issued = auth.issuePartnerToken()
    const tampered = issued.access_token.slice(0, -2) + 'xx'
    expect(auth.verifyPartnerToken(tampered)).toMatchObject({ ok: false })
  })

  it('rejects an expired token', async () => {
    const auth = await loadAuth(STAGING)
    const issued = auth.issuePartnerToken(Date.now() - 8 * 24 * 60 * 60 * 1000)
    expect(auth.verifyPartnerToken(issued.access_token)).toMatchObject({
      ok: false,
      reason: 'token expired',
    })
  })

  it('verifies client credentials', async () => {
    const auth = await loadAuth(STAGING)
    expect(auth.verifyClientCredentials('pos-client', 'pos-secret')).toBe(true)
    expect(auth.verifyClientCredentials('pos-client', 'wrong')).toBe(false)
    expect(auth.verifyClientCredentials('wrong', 'pos-secret')).toBe(false)
  })
})

describe('authenticatePartnerRequest', () => {
  it('allows requests in mock mode when no partner credentials are configured', async () => {
    const auth = await loadAuth({ GRABFOOD_ENV: 'mock' })
    expect(auth.authenticatePartnerRequest({ headers: headers() })).toEqual({ ok: true })
  })

  it('requires a bearer token in staging', async () => {
    const auth = await loadAuth(STAGING)
    expect(auth.authenticatePartnerRequest({ headers: headers() })).toMatchObject({
      ok: false,
      status: 401,
    })
  })

  it('accepts a valid bearer token and enforces scope', async () => {
    const auth = await loadAuth(STAGING)
    const token = auth.issuePartnerToken().access_token
    expect(
      auth.authenticatePartnerRequest(
        { headers: headers({ authorization: `Bearer ${token}` }) },
        { scope: 'food.partner_api' }
      )
    ).toEqual({ ok: true })
    expect(
      auth.authenticatePartnerRequest(
        { headers: headers({ authorization: `Bearer ${token}` }) },
        { scope: 'food.partner.loyalty' }
      )
    ).toMatchObject({ ok: false, status: 403 })
  })

  it('enforces HMAC only when explicitly required', async () => {
    const auth = await loadAuth({ ...STAGING, GRABFOOD_WEBHOOK_HMAC_REQUIRED: 'true' })
    const token = auth.issuePartnerToken().access_token
    const req = { headers: headers({ authorization: `Bearer ${token}` }) }
    expect(auth.authenticatePartnerRequest(req, { rawBody: '{}' })).toMatchObject({
      ok: false,
      status: 401,
    })
  })
})
