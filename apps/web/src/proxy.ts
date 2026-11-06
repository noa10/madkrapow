// Next.js 16 renamed Middleware to Proxy and resolves this file from the
// directory that holds the App Router. The router lives in src/app, so this
// must stay at src/proxy.ts — a root-level proxy.ts is not built.
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { refreshSession } from './lib/supabase/middleware'
import { verifyAccessToken } from './lib/supabase/jwt'
import { isValidRedirect } from './lib/auth/redirect'

/**
 * Redirect without losing the session cookies refreshSession() may have just
 * rotated. A bare Response.redirect() starts a fresh response, so an expired
 * token refreshed on this request would be dropped and the user would appear
 * signed out (or re-refresh on every visit).
 */
function redirectWithSession(url: URL, response: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url, 302)
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}

export async function proxy(request: NextRequest) {
  const { supabase, response } = await refreshSession(request)

  const pathname = request.nextUrl.pathname
  const isAdminRoute = pathname.startsWith('/admin')
  const isAuthRoute = pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')
  const isOrdersRoute = pathname.startsWith('/orders')
  const isCheckoutRoute = pathname.startsWith('/checkout')

  // Only routes with access rules need the user. Public pages and API routes
  // skip the Supabase Auth network round-trip; refreshSession still refreshes
  // the cookie/token state above.
  const needsUser = isAdminRoute || isOrdersRoute || isCheckoutRoute || isAuthRoute
  if (!needsUser) {
    return response
  }

  // /admin asks the auth server for the authoritative user, so role changes
  // take effect immediately — claims cached in an access token can be stale
  // for its remaining lifetime (up to 1h). Fail closed: if the auth server
  // is unreachable, admin is treated as signed out. (refreshSession above
  // has already refreshed an expired access token via getSession().)
  // Other routes verify locally first (JWKS cached on a module-level
  // client); the network getUser() is the fallback.
  let user: User | null
  if (isAdminRoute) {
    const {
      data: { user: networkUser },
    } = await supabase.auth.getUser()
    user = networkUser
  } else {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    user = await verifyAccessToken(session?.access_token)
    if (!user) {
      const {
        data: { user: networkUser },
      } = await supabase.auth.getUser()
      user = networkUser
    }
  }

  // Redirect unauthenticated users away from protected routes
  if (!user && !isAuthRoute && !isApiRoute) {
    const isProtectedRoute = isOrdersRoute || isCheckoutRoute || isAdminRoute
    if (isProtectedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = isCheckoutRoute ? '/auth/signup' : '/auth'
      url.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`)
      return redirectWithSession(url, response)
    }
  }

  // Redirect non-staff users away from /admin routes
  if (isAdminRoute && user) {
    const staffRoles = ['admin', 'manager', 'cashier', 'kitchen']
    const role = user.app_metadata?.role as string | undefined
    if (!role || !staffRoles.includes(role)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return redirectWithSession(url, response)
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
      return redirectWithSession(url, response)
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
     * - image files served from public/
     * - the avatar upload API: it authenticates with a bearer token and
     *   accepts 5 MB files, above the 4 MB cap on proxied request bodies
     */
    '/((?!_next/static|_next/image|favicon.ico|api/customer/avatar|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
