import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/admin/require-role'
import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase/server'

function getNextErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as Record<string, unknown>).message)
        : 'Internal server error'
}

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  role: z.enum(['admin', 'manager', 'cashier', 'kitchen']),
})

function randomPassword(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function GET(req: NextRequest) {
  try {
    const result = await requireRole(req, ['admin', 'manager'])
    if ('error' in result) return result.error
    const { supabase } = result

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    const message = getNextErrorMessage(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const result = await requireRole(req, ['admin', 'manager'])
    if ('error' in result) return result.error
    const { supabase } = result

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const validation = createEmployeeSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { name, email, phone, role } = validation.data

    // Check if employee already exists in employees table
    const { data: existingEmployee } = await supabase
      .from('employees')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingEmployee) {
      return NextResponse.json(
        { error: 'An employee with this email address already exists' },
        { status: 409 }
      )
    }

    // Find or create auth user
    let authUserId: string

    // Try to find existing auth user by email
    const { data: existingUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    // Supabase admin API doesn't support email lookup directly; try create first
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: randomPassword(),
      email_confirm: true,
      app_metadata: { role },
    })

    if (authError) {
      // If user already exists, look them up and update their role
      if (authError.message?.includes('already been registered') || authError.status === 422) {
        // Search for user by email via listUsers (paginated search is limited but works for small sets)
        // Fallback: use the signUp lookup pattern — try getUserByEmail isn't available,
        // so we iterate listUsers
        let foundUserId: string | null = null
        let page = 1
        while (!foundUserId) {
          const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
            page,
            perPage: 100,
          })
          if (listError || !usersPage?.users?.length) break
          const match = usersPage.users.find((u) => u.email === email)
          if (match) {
            foundUserId = match.id
            break
          }
          if (usersPage.users.length < 100) break
          page++
        }

        if (!foundUserId) {
          console.error('[API] Could not find existing user by email:', email)
          return NextResponse.json(
            { error: 'User exists but could not be located. Please contact support.' },
            { status: 500 }
          )
        }

        authUserId = foundUserId

        // Update their app_metadata role
        await supabase.auth.admin.updateUserById(foundUserId, {
          app_metadata: { role },
        })
      } else {
        console.error('[API] Failed to create auth user:', authError)
        return NextResponse.json(
          { error: authError?.message || 'Failed to create auth user' },
          { status: 500 }
        )
      }
    } else if (authUser?.user) {
      authUserId = authUser.user.id
    } else {
      return NextResponse.json(
        { error: 'Failed to create or locate auth user' },
        { status: 500 }
      )
    }

    // Insert employees row
    const { data: employee, error: insertError } = await supabase
      .from('employees')
      .insert({
        auth_user_id: authUserId,
        name,
        email,
        phone: phone || null,
        role,
      })
      .select()
      .single()

    if (insertError || !employee) {
      // Rollback: if we created a new auth user (not found existing), delete it
      if (!authError) {
        await supabase.auth.admin.deleteUser(authUserId)
      }
      console.error('[API] Failed to insert employee:', insertError)
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create employee record' },
        { status: 500 }
      )
    }

    // Send password reset / magic link (only for new users; skip if existing)
    if (!authError) {
      try {
        await supabase.auth.admin.generateLink({
          type: 'recovery',
          email,
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_URL}/auth/callback`,
          },
        })
      } catch (linkError) {
        console.warn('[API] Failed to send recovery link:', linkError)
      }
    }

    return NextResponse.json({ data: employee }, { status: 201 })
  } catch (error) {
    const message = getNextErrorMessage(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
