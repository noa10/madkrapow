import { describe, it, expect } from 'vitest'
import Stripe from 'stripe'
import { STRIPE_API_VERSION } from '../api-version'

// Deliberately does not mock `stripe`: this asserts our pinned constant against
// the real installed SDK, so a future `stripe` bump that changes the API version
// fails here instead of silently changing payment behaviour in production.
describe('STRIPE_API_VERSION', () => {
  it('matches the API version pinned by the installed Stripe SDK', () => {
    expect(STRIPE_API_VERSION).toBe(Stripe.API_VERSION)
  })
})
