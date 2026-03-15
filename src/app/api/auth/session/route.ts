import { getServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await getServerClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ user })
}