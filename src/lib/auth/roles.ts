export interface RoleAwareUser {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}

const ADMIN_ROLE = 'admin'

export function isAdminUser(user: RoleAwareUser | null | undefined) {
  const role = user?.app_metadata?.role
  return role === ADMIN_ROLE
}
