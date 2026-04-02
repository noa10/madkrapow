import { type NextRequest } from 'next/server'
import { refreshSession } from './src/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { response } = await refreshSession(request)
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
