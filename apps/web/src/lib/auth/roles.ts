export interface RoleAwareUser {
  email?: string | null
  app_metadata?: Record<string, unknown> | null
  user_metadata?: Record<string, unknown> | null
}

export type StaffRole = 'admin' | 'manager' | 'cashier' | 'kitchen'

export const ALL_STAFF_ROLES: StaffRole[] = ['admin', 'manager', 'cashier', 'kitchen']

const ADMIN_ROLE = 'admin'

export function isAdminUser(user: RoleAwareUser | null | undefined) {
  const role = user?.app_metadata?.role
  return role === ADMIN_ROLE
}

export function hasRole(user: RoleAwareUser | null | undefined, role: string): boolean {
  const userRole = user?.app_metadata?.role
  return userRole === role
}

export function hasAnyRole(user: RoleAwareUser | null | undefined, roles: string[]): boolean {
  const userRole = user?.app_metadata?.role as string | undefined
  if (!userRole) return false
  return roles.includes(userRole)
}

export function canManageStaff(role: string | undefined): boolean {
  return role === 'admin' || role === 'manager'
}

export const ROLE_PAGE_ACCESS: Record<StaffRole, string[]> = {
  admin: [
    '/admin',
    '/admin/orders',
    '/admin/kitchen',
    '/admin/menu',
    '/admin/analytics',
    '/admin/analytics/reports',
    '/admin/settings',
    '/admin/employees',
    '/admin/promos',
  ],
  manager: [
    '/admin',
    '/admin/orders',
    '/admin/kitchen',
    '/admin/menu',
    '/admin/employees',
    '/admin/analytics/reports',
    '/admin/promos',
  ],
  cashier: ['/admin', '/admin/orders'],
  kitchen: ['/admin', '/admin/kitchen'],
}

export function getAccessiblePages(role: string | undefined): string[] {
  if (!role) return []
  return ROLE_PAGE_ACCESS[role as StaffRole] || []
}
