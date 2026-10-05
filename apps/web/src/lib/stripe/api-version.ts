import type Stripe from 'stripe'

/**
 * The Stripe API version every client in this app pins itself to.
 *
 * Pinning is deliberate: Stripe ships breaking changes behind dated API
 * versions, so bumping the `stripe` SDK without bumping this constant would
 * silently change runtime behaviour in payment-critical code.
 *
 * Typing it as `Stripe.LatestApiVersion` turns the next SDK bump into a
 * compile error here instead of a silent behaviour change at runtime — the
 * upgrade then forces a deliberate migration (see the `stripe` entry in
 * node_modules/stripe/CHANGELOG.md for the breaking changes).
 *
 * Keep this as the single source of truth: do not inline the version string
 * at call sites.
 */
export const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2026-09-30.endive'
