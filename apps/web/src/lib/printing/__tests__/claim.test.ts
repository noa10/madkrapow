import { beforeEach, describe, expect, it, vi } from 'vitest'

const orderQueries: { gteArgs: unknown[] } = { gteArgs: [] }
let autoPrintEnabled = true

vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'orders') throw new Error(`unexpected table: ${table}`)
      const query = {
        select: () => query,
        or: () => query,
        gte: (column: string, value: string) => {
          orderQueries.gteArgs.push([column, value])
          return query
        },
        order: () => Promise.resolve({ data: [], error: null }),
      }
      return query
    },
  }),
}))

vi.mock('../store-settings', () => ({
  loadPrintStoreSettings: async () => ({
    storeName: 'Mad Krapow Subang Permai',
    address: '',
    phone: '',
    companyName: '',
    companyRegistration: '',
    footer: '',
    taxRatePercent: 6,
    paperWidth: '80',
    autoPrintEnabled,
  }),
  charsPerLineFor: () => 48,
  DEFAULT_PRINT_STORE_SETTINGS: {},
}))

vi.mock('../order-loader', () => ({ loadPrintOrder: async () => null }))

const { claimPendingJobs } = await import('../claim')

describe('claimPendingJobs', () => {
  beforeEach(() => {
    orderQueries.gteArgs = []
    autoPrintEnabled = true
  })

  it('looks back 30 minutes for the merchant app so a first launch cannot dump a backlog', async () => {
    const before = Date.now()
    await claimPendingJobs('staff')
    const [, since] = orderQueries.gteArgs[0] as [string, string]
    const ageMinutes = (before - new Date(since).getTime()) / 60_000
    expect(ageMinutes).toBeGreaterThan(29)
    expect(ageMinutes).toBeLessThan(31)
  })

  it('looks back a day for the LAN bridge', async () => {
    const before = Date.now()
    await claimPendingJobs('bridge')
    const [, since] = orderQueries.gteArgs[0] as [string, string]
    const ageHours = (before - new Date(since).getTime()) / 3600_000
    expect(ageHours).toBeGreaterThan(23)
    expect(ageHours).toBeLessThan(25)
  })

  it('claims nothing when auto-printing is switched off', async () => {
    autoPrintEnabled = false
    const jobs = await claimPendingJobs('staff')
    expect(jobs).toEqual([])
    expect(orderQueries.gteArgs).toHaveLength(0)
  })
})
