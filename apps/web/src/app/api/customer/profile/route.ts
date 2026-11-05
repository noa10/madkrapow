import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/supabase/server'
import {
  loadCustomerProfile,
  ProfileLoadError,
  type CustomerProfile,
} from '@/lib/customer/profile'

type ProfileResult =
  | ({ success: true } & CustomerProfile)
  | { success: false; error: string }

export async function GET(req: NextRequest): Promise<NextResponse<ProfileResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !user.email || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const profile = await loadCustomerProfile(user, supabase)

    return NextResponse.json({ success: true, ...profile }, { status: 200 })
  } catch (error) {
    if (error instanceof ProfileLoadError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      )
    }

    console.error('[API] /api/customer/profile:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse<ProfileResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const validation = z.object({
      name: z.string().max(100).optional().nullable(),
      phone: z.string().max(50).optional().nullable(),
      avatarUrl: z.string().url().optional().nullable(),
    }).safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input: ' + validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') },
        { status: 400 }
      )
    }

    const { name, phone, avatarUrl } = validation.data

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json(
        { success: false, error: 'Customer profile not found' },
        { status: 404 }
      )
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name?.trim() || null
    if (phone !== undefined) updates.phone = phone?.trim() || null
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', customer.id)

    if (error) {
      console.error('[API] Failed to update customer:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to update profile' },
        { status: 500 }
      )
    }

    if (name !== undefined) {
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { full_name: name?.trim() || null },
      })
    }

    return NextResponse.json(
      {
        success: true,
        customer: {
          id: customer.id,
          name: name?.trim() || null,
          phone: phone?.trim() || null,
          email: user.email || null,
          avatarUrl: avatarUrl ?? null,
        },
        addresses: [],
        contacts: [],
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] PATCH /api/customer/profile:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
