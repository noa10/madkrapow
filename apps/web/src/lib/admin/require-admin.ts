import { NextRequest } from 'next/server'
import { requireRole } from './require-role'

/**
 * Authenticate and authorize an admin user from a Next.js API route request.
 * Supports both cookie-based (web) and Bearer token (mobile) auth.
 *
 * Returns { user, supabase } on success, or a NextResponse error on failure.
 *
 * Backward-compatible wrapper around requireRole(['admin']).
 */
export async function requireAdmin(req: NextRequest) {
  return requireRole(req, ['admin'])
}
