import { describe, expect, it, vi } from 'vitest'
import { markGrabOrderReady } from '../order-actions'
import { GrabFoodApiError } from '../client'

type Claim = { state: string; claim_token: string; updated_at: string }
function database(initial: Claim | null = null) {
  let claim = initial
  let failFinish = false
  const db = {
    get claim() { return claim },
    failFinish() { failFinish = true },
    from(table: string) {
      if (table === 'channel_orders') return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { order_id: 'o', external_order_id: 'g', orders: { status: 'ready' } }, error: null,
        }) }) }) }),
      }
      if (table !== 'grabfood_ready_claims') throw Error(`Unexpected table ${table}`)
      return {
        insert: async (value: Claim) => {
          if (claim) return { error: { code: '23505' } }
          claim = { ...value, updated_at: new Date().toISOString() }
          return { error: null }
        },
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: claim && { ...claim }, error: null }) }) }),
        update: (value: Partial<Claim>) => {
          const filters: Record<string, string> = {}
          const query = {
            eq(key: string, val: string) { filters[key] = val; return query },
            async select() {
              if (failFinish && value.state !== 'pending') return { data: null, error: { message: 'offline' } }
              if (!claim || (filters.state && filters.state !== claim.state) ||
                  (filters.claim_token && filters.claim_token !== claim.claim_token)) return { data: [], error: null }
              claim = { ...claim, ...value }
              return { data: [{ order_id: 'o' }], error: null }
            },
          }
          return query
        },
      }
    },
  }
  return db
}
const client = (fn: () => Promise<void>) => ({ markOrderReady: vi.fn(fn) })

describe('Grab Mark Ready claims', () => {
  it('sends once while a concurrent request is in flight and after it completes', async () => {
    const db = database()
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>(r => { entered = r })
    const blocked = new Promise<void>(r => { release = r })
    const grab = client(async () => { entered(); await blocked })
    const first = markGrabOrderReady(db as never, 'o', { client: grab as never })
    await started
    const second = await markGrabOrderReady(db as never, 'o', { client: grab as never })
    expect(second).toMatchObject({ ok: false, status: 409 })
    release()
    expect(await first).toMatchObject({ ok: true })
    expect(await markGrabOrderReady(db as never, 'o', { client: grab as never })).toMatchObject({ ok: true })
    expect(grab.markOrderReady).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit checked retry after a timeout or interrupted claim', async () => {
    const db = database()
    const grab = client(async () => { throw Error('timeout') })
    expect(await markGrabOrderReady(db as never, 'o', { client: grab as never })).toMatchObject({ ok: false, status: 502, uncertain: true })
    expect(await markGrabOrderReady(db as never, 'o', { client: grab as never })).toMatchObject({ ok: false, status: 409, uncertain: true })
    expect(grab.markOrderReady).toHaveBeenCalledTimes(1)
    const retry = client(async () => {})
    expect(await markGrabOrderReady(db as never, 'o', { client: retry as never, retryUncertain: true })).toMatchObject({ ok: true })
    const interrupted = database({ state: 'pending', claim_token: 'old', updated_at: '2020-01-01T00:00:00Z' })
    expect(await markGrabOrderReady(interrupted as never, 'o', { client: retry as never })).toMatchObject({ uncertain: true })
  })

  it('allows retry after a definite rejection but treats failed confirmation writes as uncertain', async () => {
    const db = database()
    const reject = client(async () => { throw new GrabFoodApiError('rejected', 400, '/ready') })
    expect(await markGrabOrderReady(db as never, 'o', { client: reject as never })).toMatchObject({ status: 502, uncertain: false })
    const retry = client(async () => {})
    db.failFinish()
    expect(await markGrabOrderReady(db as never, 'o', { client: retry as never })).toMatchObject({ status: 503, uncertain: true })
    expect(db.claim?.state).toBe('pending')
    expect(await markGrabOrderReady(db as never, 'o', { client: retry as never })).toMatchObject({ status: 409 })
    expect(retry.markOrderReady).toHaveBeenCalledTimes(1)
  })
})
