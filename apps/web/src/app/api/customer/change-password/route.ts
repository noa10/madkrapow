import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/supabase/server'

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

interface PasswordResult {
  success: boolean
  error?: string
  message?: string
}

export async function POST(req: NextRequest): Promise<NextResponse<PasswordResult>> {
  try {
    const { user, supabase } = await getAuthenticatedUser(req)

    if (!user || !supabase) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON' },
        { status: 400 }
      )
    }

    const parsed = ChangePasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ') },
        { status: 400 }
      )
    }

    const { currentPassword, newPassword } = parsed.data

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    })

    if (signInError) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 401 }
      )
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      console.error('[API] Failed to update password:', updateError)
      return NextResponse.json(
        { success: false, error: updateError.message || 'Failed to change password' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'Password changed successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] POST /api/customer/change-password:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
