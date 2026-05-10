import { type NextRequest } from 'next/server'
import { refreshSession } from './src/lib/supabase/middleware'

/** Validate a redirect URL to prevent open-redirect attacks. Only same-origin, relative paths allowed. */
function isValidRedirect(redirect: string): boolean {
  if (!redirect.startsWith('/')) return false
  // Block protocol-relative URLs (//evil.com) and backslash tricks
  if (redirect.startsWith('//') || redirect.startsWith('\\')) return false
  // Block any URL with a host component
  try {
    const url = new URL(redirect, 'http://localhost')
    if (url.host !== 'localhost') return false
  } catch {
    return false
  }
  return true
}

export async function middleware(request: NextRequest) {
  const { supabase, response } = await refreshSession(request)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAdminRoute = pathname.startsWith('/admin')
  const isAuthRoute = pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')

  // Redirect unauthenticated users away from protected routes
  if (!user && !isAuthRoute && !isApiRoute) {
    const isProtectedRoute =
      pathname.startsWith('/orders') ||
      pathname.startsWith('/checkout') ||
      isAdminRoute
    if (isProtectedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = pathname.startsWith('/checkout') ? '/auth/signup' : '/auth'
      url.searchParams.set('redirect', pathname)
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

  // Redirect authenticated users away from auth screens (unless they have a valid redirect)
  if (user && isAuthRoute && !pathname.startsWith('/auth/callback') && !pathname.startsWith('/auth/update-password')) {
    const redirect = request.nextUrl.searchParams.get('redirect')
    if (redirect && isValidRedirect(redirect)) {
      // Let them through to login page with redirect preserved (they may be unverified)
    } else {
      // Already authenticated, no redirect — go home (or admin if staff)
      const staffRoles = ['admin', 'manager', 'cashier', 'kitchen']
      const role = user.app_metadata?.role as string | undefined
      const isStaff = role && staffRoles.includes(role)
      const url = request.nextUrl.clone()
      url.pathname = isStaff ? '/admin' : '/'
      url.searchParams.delete('redirect')
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
