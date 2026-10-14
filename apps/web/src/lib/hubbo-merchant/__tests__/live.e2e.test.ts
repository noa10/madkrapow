/**
 * LIVE end-to-end dry-run against the real alimentsBackend (runbook §2).
 *
 * Unlike the mocked route test, NOTHING here is faked on the wire: the real
 * `HubboMerchantClient` performs a real `fetch` to `api.aliments.my` using a
 * captured device `apiKey`, and the real `mapHubboMenuToLocal` maps the genuine
 * payload. This is the test that would have caught the original bugs (flat vs
 * `body`-wrapped envelope, RM-decimal vs sen prices, `subCategories[0].id`
 * linkage, epoch-ms `snoozeTill`).
 *
 * Gated so CI never depends on a live credential or the network. Opt in:
 *
 *   HUBBO_LIVE_E2E=1 \
 *   HUBBO_MERCHANT_API_KEY=<captured device apiKey> \
 *   npx vitest run apps/web/src/lib/hubbo-merchant/__tests__/live.e2e.test.ts
 *
 * The key is read from the environment only — never hardcoded, never committed.
 * It belongs to a real merchant device: treat a failing run as a possible
 * rotation, not as a reason to paste a new key into the repo.
 *
 * NOTE: the backend rate-limits this endpoint per burst — two concurrent pulls
 * return `429 too_many_requests` while a sequential request succeeds moments
 * later. The test therefore fetches exactly ONCE in `beforeAll` and retries
 * briefly on 429, so it exercises the live path without tripping the limiter.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const LIVE_API_KEY = process.env.HUBBO_MERCHANT_API_KEY ?? ''
const LIVE_ENABLED = process.env.HUBBO_LIVE_E2E === '1' && LIVE_API_KEY.length > 0

// Real env values sourced from the process environment, funnelled through the
// same validated accessor the app uses. auth.ts does NOT consult ENABLED — the
// credential and base URL are what let the client talk to the backend.
vi.mock('@/lib/validators/env', () => ({
  env: {
    HUBBO_MERCHANT_ENABLED: true,
    HUBBO_MERCHANT_API_KEY: LIVE_API_KEY,
    HUBBO_MERCHANT_BASE_URL:
      process.env.HUBBO_MERCHANT_BASE_URL ?? 'https://api.aliments.my/alimentsBackend',
    HUBBO_MERCHANT_ANDROID_ID: undefined,
    HUBBO_MERCHANT_DEVICE_ID: undefined,
  },
}))

// A dry run must be provably read-only: any attempt to reach the database fails
// the test loudly instead of quietly writing to a real catalog.
const dbTouched = vi.fn()
const supabaseStub = {
  from: (table: string) => {
    dbTouched(table)
    throw new Error('dry run must not touch the database')
  },
} as unknown as SupabaseClient

const { pullHubboMenu, mapHubboMenuToLocal } = await import('../menu')
const { createHubboMerchantClient } = await import('../client')
import type { HubboMenuToLocalResult, HubboMenuPullResult } from '../menu'

let pullResult: HubboMenuPullResult
let plan: HubboMenuToLocalResult

/** Retry only on the backend's burst limiter; surface every other error as-is. */
async function withRateLimitRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const isRateLimited = err instanceof Error && err.message.includes('(429)')
      if (!isRateLimited || attempt === attempts) throw err
      await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt))
    }
  }
  throw lastError
}

describe.skipIf(!LIVE_ENABLED)('live dry-run against the real alimentsBackend', () => {
  beforeAll(async () => {
    // Two sequential (never concurrent) round-trips for the whole file; both
    // assertions below inspect this same genuine payload.
    pullResult = await withRateLimitRetry(() => pullHubboMenu(supabaseStub, { dryRun: true }))
    const menu = await withRateLimitRetry(() => createHubboMerchantClient().getMenu())
    plan = mapHubboMenuToLocal(menu)
  }, 60_000)

  it('pulls and maps the real merchant menu without writing', () => {
    expect(pullResult.dryRun).toBe(true)
    // Structural guarantee: a dry run reports no writes and never reaches the
    // database, so the plan can be inspected safely against production.
    expect(pullResult.categoriesUpserted).toBe(0)
    expect(pullResult.itemsUpserted).toBe(0)
    expect(pullResult.grabfoodMappingsCreated).toBe(0)
    expect(dbTouched).not.toHaveBeenCalled()
    expect(Array.isArray(pullResult.warnings)).toBe(true)

    // The live merchant really does return a menu; 0 scanned here would mean
    // the flat envelope regressed and the mapper silently saw an empty payload.
    expect(plan.scanned).toBeGreaterThan(0)
    expect(plan.scanned).toBeGreaterThanOrEqual(plan.items.length)
  })

  it('maps prices as integer sen and leaves a 0.0 grabfood override unset', () => {
    expect(plan.categories.length).toBeGreaterThan(0)
    expect(plan.items.length).toBeGreaterThan(0)
    expect(plan.scanned).toBeGreaterThanOrEqual(plan.items.length)

    for (const item of plan.items) {
      // integer sen, never a fractional RM value (the historical 100x bug)
      expect(Number.isInteger(item.priceCents)).toBe(true)
      expect(item.priceCents).toBeGreaterThan(0)
      expect(item.priceCents).toBeLessThanOrEqual(100_000)
      // ids are coerced to strings for the external-mapping columns
      expect(typeof item.externalId).toBe('string')
      expect(item.externalId.length).toBeGreaterThan(0)
      if (item.grabfoodPriceCents !== null) {
        expect(Number.isInteger(item.grabfoodPriceCents)).toBe(true)
        expect(item.grabfoodPriceCents).toBeGreaterThan(0)
      }
    }
  })

  it('links every item to a known category (subCategories[0].id) and maps snoozes', () => {
    const categoryIds = new Set(plan.categories.map((c) => c.externalId))
    for (const item of plan.items) {
      expect(item.externalCategoryId).not.toBeNull()
      expect(categoryIds.has(item.externalCategoryId as string)).toBe(true)
    }
    // live data currently contains future snoozeTill values; the flag must be a
    // real boolean rather than undefined/NaN
    for (const item of plan.items) {
      expect(typeof item.isAvailable).toBe('boolean')
    }
  })
})
