import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PRINT_STORE_SETTINGS,
  charsPerLineFor,
  formatStorePhone,
  includedTaxCents,
  loadPrintStoreSettings,
} from '../store-settings'

type Row = Record<string, unknown> | null

function clientReturning(data: Row, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data, error }),
          }),
        }),
      }),
    }),
  } as never
}

const FULL_ROW = {
  store_name: 'Mad Krapow',
  receipt_store_name: 'Mad Krapow Subang Permai',
  address: '52, Jalan Subang Permai U6/6, 40150 Shah Alam',
  phone: '+60193456476',
  company_name: 'Bakaris Enterprise',
  company_registration: '201903057932',
  receipt_footer: 'Thank you, come again',
  tax_rate_percent: '6',
  receipt_paper_width: '58',
  auto_print_enabled: false,
}

describe('loadPrintStoreSettings', () => {
  it('falls back to defaults when the row cannot be read', async () => {
    const settings = await loadPrintStoreSettings(clientReturning(null, { message: 'boom' }))
    expect(settings).toEqual(DEFAULT_PRINT_STORE_SETTINGS)
  })

  it('falls back to defaults when there is no row', async () => {
    expect(await loadPrintStoreSettings(clientReturning(null))).toEqual(DEFAULT_PRINT_STORE_SETTINGS)
  })

  it('reads every editable field, including NUMERIC-as-string rates', async () => {
    const settings = await loadPrintStoreSettings(clientReturning(FULL_ROW))
    expect(settings).toMatchObject({
      storeName: 'Mad Krapow Subang Permai',
      companyName: 'Bakaris Enterprise',
      companyRegistration: '201903057932',
      footer: 'Thank you, come again',
      taxRatePercent: 6,
      paperWidth: '58',
      autoPrintEnabled: false,
    })
  })

  it('keeps a deliberately cleared footer empty instead of restoring the default', async () => {
    // /admin/settings advertises "leave empty to hide the footer", so an empty
    // string is a value staff chose, not a missing setting.
    const settings = await loadPrintStoreSettings(clientReturning({ ...FULL_ROW, receipt_footer: '' }))
    expect(settings.footer).toBe('')
  })

  it('falls back to the public store name when the receipt name is blank', async () => {
    const settings = await loadPrintStoreSettings(clientReturning({ ...FULL_ROW, receipt_store_name: '   ' }))
    expect(settings.storeName).toBe('Mad Krapow')
  })

  it('treats an unknown paper width as 80mm', async () => {
    const settings = await loadPrintStoreSettings(clientReturning({ ...FULL_ROW, receipt_paper_width: 'A4' }))
    expect(settings.paperWidth).toBe('80')
  })

  it('rejects an out-of-range tax rate rather than printing nonsense', async () => {
    const settings = await loadPrintStoreSettings(clientReturning({ ...FULL_ROW, tax_rate_percent: '500' }))
    expect(settings.taxRatePercent).toBe(DEFAULT_PRINT_STORE_SETTINGS.taxRatePercent)
  })
})

describe('charsPerLineFor', () => {
  it('maps paper width to the ESC/POS character budget', () => {
    expect(charsPerLineFor('58')).toBe(32)
    expect(charsPerLineFor('80')).toBe(48)
  })
})

describe('formatStorePhone', () => {
  it('groups a Malaysian mobile number the way the receipt shows it', () => {
    expect(formatStorePhone('+60193456476')).toBe('+6019-345-6476')
  })

  it('leaves anything else alone', () => {
    expect(formatStorePhone('+60123456789')).toBe('+6012-345-6789')
    expect(formatStorePhone('03-7845 1234')).toBe('03-7845 1234')
    expect(formatStorePhone(' +60193456476 ')).toBe('+6019-345-6476')
  })
})

describe('includedTaxCents', () => {
  it('extracts the SST already inside the price', () => {
    // RM 100.00 inclusive at 6% = RM 5.66 tax (100 * 6 / 106).
    expect(includedTaxCents(10_000, 6)).toBe(566)
  })

  it('is zero when there is nothing to tax or no rate', () => {
    expect(includedTaxCents(0, 6)).toBe(0)
    expect(includedTaxCents(-500, 6)).toBe(0)
    expect(includedTaxCents(10_000, 0)).toBe(0)
  })
})
