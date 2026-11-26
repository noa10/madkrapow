import type { PrintOrder } from './jobs'

/** Match the kitchen order visibility policy in migration 075. */
export function canStaffPrintOrder(role: string | undefined, order: Pick<PrintOrder, 'status' | 'source' | 'deliveryType'>): boolean {
  if (role === 'admin' || role === 'manager' || role === 'cashier') return true
  if (role !== 'kitchen') return false
  return ['paid', 'accepted', 'preparing', 'ready'].includes(order.status ?? '') ||
    (order.status === 'pending' && (order.deliveryType === 'dine_in' || order.source === 'counter'))
}
