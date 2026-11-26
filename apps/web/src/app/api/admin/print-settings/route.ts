import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/admin/require-role'

export const runtime = 'nodejs'

/** Columns the receipt printer reads; the admin card edits all of them. */
const PRINT_SETTINGS_COLUMNS =
  'receipt_store_name, address, phone, company_name, company_registration, receipt_footer, tax_rate_percent, receipt_paper_width, auto_print_enabled'

const PrintSettingsPatchSchema = z
  .object({
    receipt_store_name: z.string().trim().min(1).max(80).optional(),
    address: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    company_name: z.string().trim().min(1).max(80).optional(),
    company_registration: z.string().trim().min(1).max(40).optional(),
    // An empty footer is meaningful: it hides the footer line on the receipt.
    receipt_footer: z.string().trim().max(120).optional(),
    tax_rate_percent: z.number().min(0).max(100).optional(),
    receipt_paper_width: z.enum(['58', '80']).optional(),
    auto_print_enabled: z.boolean().optional(),
  })
  .strict()

const NO_STORE = { 'Cache-Control': 'no-store' }

type StoreSettingsRow = Record<string, unknown>

/**
 * Normalize a store_settings row into the JSON shape the admin card edits.
 * NUMERIC comes back from PostgREST as either a number or a string depending
 * on the driver, so the rate is coerced here rather than in the browser.
 */
function serializePrintSettings(row: StoreSettingsRow) {
  const rawRate =
    typeof row.tax_rate_percent === 'string'
      ? Number(row.tax_rate_percent)
      : row.tax_rate_percent

  return {
    receipt_store_name: typeof row.receipt_store_name === 'string' ? row.receipt_store_name : '',
    address: typeof row.address === 'string' ? row.address : '',
    phone: typeof row.phone === 'string' ? row.phone : '',
    company_name: typeof row.company_name === 'string' ? row.company_name : '',
    company_registration:
      typeof row.company_registration === 'string' ? row.company_registration : '',
    receipt_footer: typeof row.receipt_footer === 'string' ? row.receipt_footer : '',
    tax_rate_percent:
      typeof rawRate === 'number' && Number.isFinite(rawRate) ? rawRate : 0,
    receipt_paper_width: row.receipt_paper_width === '58' ? ('58' as const) : ('80' as const),
    auto_print_enabled: row.auto_print_enabled !== false,
  }
}

/** Read the print settings. Never cached: the printer reads the same row. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(req, ['admin'])
    if ('error' in auth) return auth.error

    const { data, error } = await auth.supabase
      .from('store_settings')
      .select(PRINT_SETTINGS_COLUMNS)
      // store_settings should hold one row; production also carries a demo row
      // ("Mad Krapow TTDI Jaya"), so pin the oldest row — the real profile.
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error || !data) {
      console.error('[API/AdminPrintSettings] Failed to load:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to load receipt settings' },
        { status: 500, headers: NO_STORE }
      )
    }

    return NextResponse.json(serializePrintSettings(data as StoreSettingsRow), {
      headers: NO_STORE,
    })
  } catch (err) {
    console.error('[API/AdminPrintSettings] GET error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    )
  }
}

/** Update any subset of the print settings on the singleton store_settings row. */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireRole(req, ['admin'])
    if ('error' in auth) return auth.error

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400, headers: NO_STORE }
      )
    }

    const parsed = PrintSettingsPatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE }
      )
    }

    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined)
    )

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400, headers: NO_STORE }
      )
    }

    const { data: current, error: readError } = await auth.supabase
      .from('store_settings')
      .select('id')
      // Same row the GET and the printer read: the oldest (real) profile.
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (readError || !current) {
      console.error('[API/AdminPrintSettings] Failed to resolve row:', readError)
      return NextResponse.json(
        { success: false, error: 'Failed to update receipt settings' },
        { status: 500, headers: NO_STORE }
      )
    }

    const { data, error } = await auth.supabase
      .from('store_settings')
      .update(updates)
      .eq('id', (current as { id: string }).id)
      .select(PRINT_SETTINGS_COLUMNS)
      .single()

    if (error || !data) {
      console.error('[API/AdminPrintSettings] Update failed:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update receipt settings' },
        { status: 500, headers: NO_STORE }
      )
    }

    return NextResponse.json(
      { success: true, settings: serializePrintSettings(data as StoreSettingsRow) },
      { headers: NO_STORE }
    )
  } catch (err) {
    console.error('[API/AdminPrintSettings] PATCH error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: NO_STORE }
    )
  }
}
