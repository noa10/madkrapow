import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/supabase/server'
import {
  loadCustomerProfile,
} from '@/lib/customer/profile'
import { getAvailablePaymentMethods } from '@/lib/payments/availability'
import { getAutoAppliedPromos } from '@/lib/promos/auto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BootstrapRequestSchema = z.object({
  subtotalCents: z.number().int().nonnegative(),
  deliveryFeeCents: z.number().int().nonnegative(),
})

/**
 * One authenticated round trip for the three cheap reads checkout needs on
 * mount: the customer profile (saved addresses/contacts), the payment-method
 * list, and the active auto-applied promos. Delivery quotes stay on their own
 * endpoint because they depend on the address and call Lalamove.
 *
 * A profile read failure is not fatal: the response still carries the method
 * list and promos, with an empty profile, matching the old independent
 * fetches (a profile error never blocked checkout). Auth and a malformed body
 * are the only hard failures.
 */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !user.email || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = BootstrapRequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { subtotalCents, deliveryFeeCents } = parsed.data

    const [profileResult, promoResult] = await Promise.all([
      loadCustomerProfile(user, supabase)
        .then((profile) => ({ ok: true as const, profile }))
        .catch((error: unknown) => ({ ok: false as const, error })),
      subtotalCents > 0
        ? getAutoAppliedPromos(supabase, subtotalCents, deliveryFeeCents)
            .then((applied) => ({ ok: true as const, applied }))
            .catch((error: unknown) => {
              console.error('[API] /api/checkout/bootstrap promos:', error)
              return { ok: false as const, applied: [] }
            })
        : Promise.resolve({ ok: true as const, applied: [] }),
    ])

    if (!profileResult.ok) {
      console.error('[API] /api/checkout/bootstrap profile:', profileResult.error)
    }

    return NextResponse.json(
      {
        success: true,
        customer: profileResult.ok ? profileResult.profile.customer : null,
        addresses: profileResult.ok ? profileResult.profile.addresses : [],
        contacts: profileResult.ok ? profileResult.profile.contacts : [],
        methods: getAvailablePaymentMethods(),
        applied: promoResult.applied,
        // A non-auth profile failure is surfaced so the client can fall back
        // to the standalone profile endpoint without guessing why it is empty.
        profileUnavailable: !profileResult.ok,
        // A promo query failure is not "no promos": the client must retry the
        // standalone promo read instead of marking this pair as applied.
        promosUnavailable: !promoResult.ok,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[API] /api/checkout/bootstrap:', error)
    return NextResponse.json(
      { error: 'Unable to load checkout' },
      { status: 500 },
    )
  }
}
