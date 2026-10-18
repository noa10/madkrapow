/**
 * Kitchen status presentation.
 *
 * Kept out of the page so the invariant that matters can be tested: every
 * status the kitchen actually fetches must have its own label. `accepted` was
 * missing here once, so accepted orders silently rendered as "Pending" with
 * the pending colour — a wrong status on the ticket the kitchen cooks from.
 */

export interface StatusConfig {
  color: string
  label: string
}

/** Order statuses the kitchen is actively working on. */
export const ACTIVE_STATUSES = ['paid', 'accepted', 'preparing', 'ready']

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: {
    color: 'bg-amber-500/20 text-amber-500 border border-amber-500/50',
    label: 'Pending',
  },
  paid: { color: 'bg-sky-500 text-white', label: 'Paid' },
  accepted: { color: 'bg-violet-500 text-white', label: 'Accepted' },
  preparing: { color: 'bg-orange-500 text-white', label: 'Preparing' },
  ready: { color: 'bg-emerald-500 text-white', label: 'Ready' },
  delivering: { color: 'bg-indigo-500 text-white', label: 'Delivering' },
  completed: { color: 'bg-teal-500 text-white', label: 'Completed' },
  cancelled: {
    color: 'bg-destructive text-destructive-foreground',
    label: 'Cancelled',
  },
}

/** Config for `status`, falling back to pending for anything unrecognised. */
export function statusConfigFor(status: string): StatusConfig {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
}
