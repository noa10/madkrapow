import type { SupabaseClient } from '@supabase/supabase-js'

export type TableEventType =
  | 'created'
  | 'updated'
  | 'activated'
  | 'deactivated'
  | 'token_rotated'
  | 'deleted'

interface TableEventInput {
  tableId: string | null
  tableLabel: string
  eventType: TableEventType
  actorId: string
  details?: Record<string, unknown>
}

/**
 * Append a floor-plan audit row (`table_events`, migration 064).
 *
 * The write is best-effort: the table change has already committed, so failing
 * the request would tell the caller the action did not happen. A failed insert
 * is logged with the identifiers needed to reconstruct it by hand.
 */
export async function recordTableEvent(
  supabase: SupabaseClient,
  input: TableEventInput
): Promise<void> {
  const { error } = await supabase.from('table_events').insert({
    table_id: input.tableId,
    table_label: input.tableLabel,
    event_type: input.eventType,
    actor_id: input.actorId,
    details: input.details ?? {},
  })

  if (error) {
    console.error(
      `[TableEvents] Audit insert failed (${input.eventType}, table ${input.tableId ?? 'deleted'}):`,
      error
    )
  }
}
