import { getServiceClient } from '@/lib/supabase/server';
import { createHubboPosClient } from './client';
import { syncCatalog } from './catalog';
import { flushQueue, getQueueStats } from './queue';
import { pullOrdersForReconciliation } from './payments';
import { initCircuitBreaker, getCircuitState } from './circuit-breaker';
import { HUBBOPOS_DEFAULTS } from './constants';
import type { HubboPosSyncRunType } from './types';

interface SyncResult {
  syncRunId: string;
  healthCheck: { connected: boolean; status: string; error: string | null };
  catalogSync: { synced: boolean; categories: number; items: number; modifierGroups: number; modifiers: number } | null;
  orderPull: { pulled: number } | null;
  queueFlush: { flushed: number; failed: number; permanentlyFailed: number };
  reconciliation: Record<string, unknown> | null;
  circuitState: string;
  queueStats: { pending: number; processing: number; completed: number; failedPermanent: number; failedRetryable: number; total: number };
  error: string | null;
}

export async function runFullSync(runType: HubboPosSyncRunType = 'scheduled', triggeredBy = 'cron'): Promise<SyncResult> {
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  const { data: syncRun } = await supabase
    .from('hubbopos_sync_runs')
    .insert({
      run_type: runType,
      started_at: now,
      status: 'running',
      triggered_by: triggeredBy,
    })
    .select('id')
    .single();

  const syncRunId = syncRun?.id;

  const result: SyncResult = {
    syncRunId,
    healthCheck: { connected: false, status: 'unknown', error: null },
    catalogSync: null,
    orderPull: null,
    queueFlush: { flushed: 0, failed: 0, permanentlyFailed: 0 },
    reconciliation: null,
    circuitState: 'unknown',
    queueStats: { pending: 0, processing: 0, completed: 0, failedPermanent: 0, failedRetryable: 0, total: 0 },
    error: null,
  };

  try {
    await initCircuitBreaker();
    result.circuitState = getCircuitState().state;

    const client = createHubboPosClient();
    const healthCheck = await client.testConnection();
    result.healthCheck = {
      connected: healthCheck.connected,
      status: healthCheck.status,
      error: healthCheck.error,
    };

    if (!healthCheck.connected) {
      await supabase
        .from('store_settings')
        .update({
          hubbo_pos_health_status: 'unhealthy',
          hubbo_pos_last_error: healthCheck.error,
          hubbo_pos_last_error_at: now,
        })
        .eq('hubbo_pos_enabled', true);

      await completeSyncRun(syncRunId, result, 'HubboPOS connection failed');
      return result;
    }

    const catalogResult = await syncCatalog();
    result.catalogSync = {
      synced: true,
      categories: catalogResult.categoriesSynced,
      items: catalogResult.itemsSynced,
      modifierGroups: catalogResult.modifierGroupsSynced,
      modifiers: catalogResult.modifiersSynced,
    };

    const timeBefore = now;
    const timeAfter = new Date(Date.now() - HUBBOPOS_DEFAULTS.ORDER_POLL_WINDOW_MINUTES * 60 * 1000).toISOString();
    const orderPullResult = await pullOrdersForReconciliation(timeAfter, timeBefore);
    result.orderPull = { pulled: orderPullResult.ordersPulled };
    result.reconciliation = orderPullResult.reconciliationSnapshot;

    const queueResult = await flushQueue();
    result.queueFlush = {
      flushed: queueResult.flushed,
      failed: queueResult.failed,
      permanentlyFailed: queueResult.permanentlyFailed,
    };

    result.queueStats = await getQueueStats();

    await supabase
      .from('store_settings')
      .update({
        hubbo_pos_health_status: 'healthy',
        hubbo_pos_last_sync_at: now,
        hubbo_pos_last_error: null,
      })
      .eq('hubbo_pos_enabled', true);

    await completeSyncRun(syncRunId, result, null);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.error = errorMessage;
    result.healthCheck = { connected: false, status: 'unhealthy', error: errorMessage };

    await supabase
      .from('store_settings')
      .update({
        hubbo_pos_health_status: 'unhealthy',
        hubbo_pos_last_error: errorMessage,
        hubbo_pos_last_error_at: now,
      })
      .eq('hubbo_pos_enabled', true);

    await completeSyncRun(syncRunId, result, errorMessage);
  }

  return result;
}

async function completeSyncRun(
  syncRunId: string | undefined,
  result: SyncResult,
  errorMessage: string | null
): Promise<void> {
  if (!syncRunId) return;

  const supabase = getServiceClient();
  const now = new Date().toISOString();

  await supabase
    .from('hubbopos_sync_runs')
    .update({
      completed_at: now,
      status: errorMessage ? 'failed' : 'completed',
      catalog_synced: result.catalogSync?.synced || false,
      orders_pulled: result.orderPull?.pulled || 0,
      orders_pushed: result.queueFlush.flushed,
      queue_flushed: result.queueFlush.flushed,
      queue_failed: result.queueFlush.failed + result.queueFlush.permanentlyFailed,
      reconciliation_snapshot: result.reconciliation,
      error_message: errorMessage,
    })
    .eq('id', syncRunId);
}

export async function getSyncHistory(limit = 20): Promise<Array<Record<string, unknown>>> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('hubbopos_sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  return data || [];
}
