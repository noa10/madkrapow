import { NextRequest, NextResponse } from 'next/server'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface AvatarUploadResult {
  success: true
  avatarUrl: string
}

interface AvatarUploadError {
  success: false
  error: string
}

type AvatarResponse = AvatarUploadResult | AvatarUploadError

export async function POST(req: NextRequest): Promise<NextResponse<AvatarResponse>> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const accessToken = authHeader.slice(7)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    // Verify user with anon key to get the real user identity
    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser(accessToken)

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      )
    }

    // Upload using anon client (user's own identity) so storage RLS policies apply
    const fileExt = file.name.split('.').pop() || 'jpg'
    const filePath = `${user.id}/${Date.now()}.${fileExt}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await anonClient.storage
      .from('profile-photos')
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error('[API] Avatar upload failed:', uploadError)
      return NextResponse.json(
        { success: false, error: 'Failed to upload image' },
        { status: 500 }
      )
    }

    const { data: { publicUrl } } = anonClient.storage
      .from('profile-photos')
      .getPublicUrl(filePath)

    // Update customers table with avatar_url (service client bypasses RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: updateError } = await serviceClient
      .from('customers')
      .update({ avatar_url: publicUrl })
      .eq('auth_user_id', user.id)

    if (updateError) {
      console.error('[API] Failed to update avatar_url:', updateError)
    }

    // Also mirror avatar_url to user_metadata for quick header access
    await serviceClient.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, avatar_url: publicUrl },
    })

    return NextResponse.json(
      { success: true, avatarUrl: publicUrl },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] POST /api/customer/avatar:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse<AvatarResponse>> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const accessToken = authHeader.slice(7)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authError } = await anonClient.auth.getUser(accessToken)

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }


    const { data: files } = await anonClient.storage
      .from('profile-photos')
      .list(user.id)

    if (files && files.length > 0) {
      const filePaths = files.map((f) => `${user.id}/${f.name}`)
      await anonClient.storage
        .from('profile-photos')
        .remove(filePaths)
    }

    // Clear avatar_url from customers table
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    await serviceClient
      .from('customers')
      .update({ avatar_url: null })
      .eq('auth_user_id', user.id)

    const { avatar_url: _, ...restMetadata } = user.user_metadata ?? {}
    await serviceClient.auth.admin.updateUserById(user.id, {
      user_metadata: { ...restMetadata },
    })

    return NextResponse.json(
      { success: true, avatarUrl: '' },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] DELETE /api/customer/avatar:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
