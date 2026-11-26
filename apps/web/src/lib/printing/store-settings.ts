/**
 * Receipt identity + printer settings, read from the single `store_settings`
 * row.
 *
 * The receipt header used to be hardcoded ('Mad Krapow' + STORE_ADDRESS /
 * STORE_PHONE env vars), which meant a branch rename or a new company
 * registration number needed a deploy. Staff now edit these in
 * /admin/settings; printing falls back to the env/default values below when
 * the row cannot be read, because a missing setting must never stop a ticket
 * from printing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/validators/env'

export type PaperWidth = '58' | '80'

export interface PrintStoreSettings {
  /** Name printed at the top of the receipt (not the public site's store_name). */
  storeName: string
  address: string
  phone: string
  companyName: string
  companyRegistration: string
  /** Free-text line at the foot of the receipt. */
  footer: string
  /** SST percentage already included in menu prices; 0 hides the tax row. */
  taxRatePercent: number
  paperWidth: PaperWidth
  /** Print docket + receipt automatically when an order arrives. */
  autoPrintEnabled: boolean
}

export const DEFAULT_PRINT_STORE_SETTINGS: PrintStoreSettings = {
  storeName: 'Mad Krapow Subang Permai',
  address: env.STORE_ADDRESS ?? '',
  phone: '+6019-345-6476',
  companyName: 'Bakaris Enterprise',
  companyRegistration: '201903057932',
  footer: 'Powered by Mad Krapow',
  taxRatePercent: 6,
  paperWidth: '80',
  autoPrintEnabled: true,
}

/** Characters the ESC/POS builder can fit on one line for a paper width. */
export function charsPerLineFor(width: PaperWidth): 32 | 48 {
  return width === '58' ? 32 : 48
}

/**
 * Format a Malaysian phone number for the receipt: '+60193456476' becomes
 * '+6019-345-6476'. Anything that does not match the +60XXXXXXXXX shape is
 * returned untouched, so staff can type a landline or an international
 * number verbatim.
 */
export function formatStorePhone(phone: string): string {
  const trimmed = phone.trim()
  const match = /^\+60(\d{2})(\d{3})(\d{4})$/.exec(trimmed)
  return match ? `+60${match[1]}-${match[2]}-${match[3]}` : trimmed
}

/**
 * The tax already contained in an SST-inclusive amount.
 *
 * Menu prices include SST, so the receipt shows the portion of the taxable
 * base that is tax rather than adding a new charge — order totals are never
 * recomputed here (a receipt must always sum to the saved total_cents).
 */
export function includedTaxCents(taxableBaseCents: number, ratePercent: number): number {
  if (taxableBaseCents <= 0 || ratePercent <= 0) return 0
  return Math.round((taxableBaseCents * ratePercent) / (100 + ratePercent))
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/**
 * The footer is the one field staff may deliberately leave blank ("hide the
 * footer"), so an empty string is a real value here, not a missing one.
 */
function asFooter(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asRate(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : fallback
}

/** Read the print settings, falling back to defaults on any failure. */
export async function loadPrintStoreSettings(
  supabase: SupabaseClient
): Promise<PrintStoreSettings> {
  const { data, error } = await supabase
    .from('store_settings')
    .select(
      'store_name, receipt_store_name, address, phone, company_name, company_registration, receipt_footer, tax_rate_percent, receipt_paper_width, auto_print_enabled'
    )
    // store_settings is meant to hold one row, but production carries a second
    // demo row ("Mad Krapow TTDI Jaya"); without an explicit order the row we
    // read is arbitrary and a receipt could print another store's address.
    // Oldest row = the real store profile.
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !data) return DEFAULT_PRINT_STORE_SETTINGS

  const row = data as Record<string, unknown>
  const width = row.receipt_paper_width === '58' ? '58' : '80'
  return {
    storeName: asText(row.receipt_store_name, asText(row.store_name, DEFAULT_PRINT_STORE_SETTINGS.storeName)),
    address: asText(row.address, DEFAULT_PRINT_STORE_SETTINGS.address),
    phone: asText(row.phone, DEFAULT_PRINT_STORE_SETTINGS.phone),
    companyName: asText(row.company_name, DEFAULT_PRINT_STORE_SETTINGS.companyName),
    companyRegistration: asText(
      row.company_registration,
      DEFAULT_PRINT_STORE_SETTINGS.companyRegistration
    ),
    footer: asFooter(row.receipt_footer, DEFAULT_PRINT_STORE_SETTINGS.footer),
    taxRatePercent: asRate(row.tax_rate_percent, DEFAULT_PRINT_STORE_SETTINGS.taxRatePercent),
    paperWidth: width,
    autoPrintEnabled:
      typeof row.auto_print_enabled === 'boolean'
        ? row.auto_print_enabled
        : DEFAULT_PRINT_STORE_SETTINGS.autoPrintEnabled,
  }
}
