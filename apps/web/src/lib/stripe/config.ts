import { env } from '@/lib/validators/env'

export type StripeMode = 'test' | 'live'
export type StripeKeyState = StripeMode | 'mixed' | 'unknown' | 'missing'
export type StripeDeploymentEnvironment = 'production' | 'preview' | 'development' | 'test'

export interface StripeConfigInput {
  enabled: boolean
  secretKey?: string
  publishableKey?: string
  webhookSecret?: string
  deploymentEnvironment: StripeDeploymentEnvironment
}

export interface StripeConfigResult {
  available: boolean
  mode: StripeKeyState
  reason: string | null
}

/**
 * Stripe keys are mode-specific: a live secret must be paired with a live
 * publishable key, and a test secret with a test publishable key. A mismatch is
 * the failure mode that makes checkout render a card form which can never take
 * money, so it is rejected before a session is created.
 */
function keyMode(value: string | undefined, prefix: 'sk' | 'pk'): StripeMode | 'unknown' {
  if (!value) return 'unknown'
  if (value.startsWith(`${prefix}_live_`)) return 'live'
  if (value.startsWith(`${prefix}_test_`)) return 'test'
  return 'unknown'
}

export function getDeploymentEnvironment(): StripeDeploymentEnvironment {
  const vercelEnvironment = process.env.VERCEL_ENV
  if (
    vercelEnvironment === 'production' ||
    vercelEnvironment === 'preview' ||
    vercelEnvironment === 'development'
  ) {
    return vercelEnvironment
  }

  if (process.env.NODE_ENV === 'test') return 'test'
  if (process.env.NODE_ENV === 'production') return 'production'
  return 'development'
}

export function evaluateStripeConfig(input: StripeConfigInput): StripeConfigResult {
  const secretMode = keyMode(input.secretKey, 'sk')
  const publishableMode = keyMode(input.publishableKey, 'pk')

  let mode: StripeKeyState = 'unknown'
  if (!input.secretKey || !input.publishableKey) {
    mode = 'missing'
  } else if (secretMode === 'unknown' || publishableMode === 'unknown') {
    mode = 'unknown'
  } else if (secretMode !== publishableMode) {
    mode = 'mixed'
  } else {
    mode = secretMode
  }

  if (!input.enabled) {
    return { available: false, mode, reason: 'Stripe is disabled' }
  }

  if (mode === 'missing') {
    return { available: false, mode, reason: 'Stripe credentials are incomplete' }
  }

  if (mode === 'unknown') {
    return { available: false, mode, reason: 'Stripe keys have an unrecognised format' }
  }

  if (mode === 'mixed') {
    return {
      available: false,
      mode,
      reason: `Stripe key mode mismatch: secret is ${secretMode}, publishable is ${publishableMode}`,
    }
  }

  if (!input.webhookSecret) {
    return { available: false, mode, reason: 'Stripe webhook secret is missing' }
  }

  if (input.deploymentEnvironment === 'production' && mode !== 'live') {
    return { available: false, mode, reason: 'Stripe is in test mode in production' }
  }

  if (input.deploymentEnvironment !== 'production' && mode === 'live') {
    return { available: false, mode, reason: 'Live Stripe keys are not allowed outside production' }
  }

  return { available: true, mode, reason: null }
}

export function getStripeConfigResult(): StripeConfigResult {
  return evaluateStripeConfig({
    enabled: env.STRIPE_ENABLED !== false,
    secretKey: env.STRIPE_SECRET_KEY,
    publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    deploymentEnvironment: getDeploymentEnvironment(),
  })
}

export function isStripeAvailable(): boolean {
  return getStripeConfigResult().available
}

export function getStripeConfigIssue(): string | null {
  return getStripeConfigResult().reason
}
