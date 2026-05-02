import { type NextRequest } from 'next/server'
import { refreshSession } from './src/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { supabase, response } = await refreshSession(request)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  // Redirect unauthenticated users away from protected routes
  if (!user && !isAuthRoute && !isApiRoute) {
    const isProtectedRoute =
      request.nextUrl.pathname.startsWith('/orders') ||
      isAdminRoute
    if (isProtectedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth'
      return Response.redirect(url)
    }
  }

  // Redirect non-staff users away from /admin routes
  if (isAdminRoute && user) {
    const staffRoles = ['admin', 'manager', 'cashier', 'kitchen']
    const role = user.app_metadata?.role as string | undefined
    if (!role || !staffRoles.includes(role)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return Response.redirect(url)
    }
  }

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
