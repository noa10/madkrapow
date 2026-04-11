import { getServiceClient } from '@/lib/supabase/server';
import { createHubboPosClient } from './client';
import { buildOrderPayload } from './orders';
import { HUBBOPOS_DEFAULTS, QUEUE_ACTIONS, QUEUE_STATUSES } from './constants';
import type { HubboPosSyncQueueRecord } from './types';

interface QueueFlushResult {
  flushed: number;
  failed: number;
  permanentlyFailed: number;
}

export async function flushQueue(): Promise<QueueFlushResult> {
  const supabase = getServiceClient();
  const client = createHubboPosClient();
  const batchSize = HUBBOPOS_DEFAULTS.QUEUE_BATCH_SIZE;

  const { data: pendingItems } = await supabase
    .from('hubbopos_sync_queue')
    .select('*')
    .eq('status', QUEUE_STATUSES.PENDING)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (!pendingItems?.length) {
    return { flushed: 0, failed: 0, permanentlyFailed: 0 };
  }

  let flushed = 0;
  let failed = 0;
  let permanentlyFailed = 0;

  for (const item of pendingItems as HubboPosSyncQueueRecord[]) {
    await supabase
      .from('hubbopos_sync_queue')
      .update({ status: QUEUE_STATUSES.PROCESSING, last_attempt_at: new Date().toISOString() })
      .eq('id', item.id);

    try {
      const result = await processQueueItem(client, item);

      if (result.success) {
        await supabase
          .from('hubbopos_sync_queue')
          .update({ status: QUEUE_STATUSES.COMPLETED })
          .eq('id', item.id);
        flushed += 1;
      } else if (result.permanent) {
        await supabase
          .from('hubbopos_sync_queue')
          .update({
            status: QUEUE_STATUSES.FAILED_PERMANENT,
            last_error: result.error,
          })
          .eq('id', item.id);
        permanentlyFailed += 1;
      } else {
        const retryCount = item.retry_count + 1;
        const maxRetries = item.max_retries || HUBBOPOS_DEFAULTS.MAX_RETRIES;
        const nextAttemptAt = new Date(Date.now() + HUBBOPOS_DEFAULTS.RETRY_BASE_DELAY_MS * Math.pow(2, retryCount)).toISOString();

        await supabase
          .from('hubbopos_sync_queue')
          .update({
            status: QUEUE_STATUSES.PENDING,
            retry_count: retryCount,
            last_error: result.error,
            next_attempt_at: nextAttemptAt,
          })
          .eq('id', item.id);

        if (retryCount >= maxRetries) {
          await supabase
            .from('hubbopos_sync_queue')
            .update({ status: QUEUE_STATUSES.FAILED_PERMANENT })
            .eq('id', item.id);
          permanentlyFailed += 1;
        } else {
          failed += 1;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await supabase
        .from('hubbopos_sync_queue')
        .update({
          status: QUEUE_STATUSES.PENDING,
          retry_count: item.retry_count + 1,
          last_error: errorMessage,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      failed += 1;
    }
  }

  return { flushed, failed, permanentlyFailed };
}

async function processQueueItem(
  client: ReturnType<typeof createHubboPosClient>,
  item: HubboPosSyncQueueRecord
): Promise<{ success: boolean; permanent: boolean; error?: string }> {
  switch (item.action) {
    case QUEUE_ACTIONS.CREATE_ORDER: {
      const payload = await buildOrderPayload(item.order_id);
      if (!payload) {
        return { success: false, permanent: true, error: 'Order not found' };
      }
      await client.createOrder(payload);
      return { success: true, permanent: false };
    }
    case QUEUE_ACTIONS.UPDATE_STATUS: {
      return { success: true, permanent: false };
    }
    case QUEUE_ACTIONS.CANCEL_ORDER: {
      return { success: true, permanent: false };
    }
    default:
      return { success: false, permanent: true, error: `Unknown action: ${item.action}` };
  }
}

export async function enqueueOrderSync(
  orderId: string,
  action: 'create_order' | 'update_status' | 'cancel_order',
  payload: Record<string, unknown>
): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from('hubbopos_sync_queue').insert({
    order_id: orderId,
    action,
    payload,
    status: QUEUE_STATUSES.PENDING,
    next_attempt_at: new Date().toISOString(),
  });
}

export async function getQueueStats(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failedPermanent: number;
  failedRetryable: number;
  total: number;
}> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('hubbopos_sync_queue')
    .select('status');

  const stats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failedPermanent: 0,
    failedRetryable: 0,
    total: 0,
  };

  for (const item of data || []) {
    stats.total += 1;
    switch (item.status) {
      case QUEUE_STATUSES.PENDING: stats.pending += 1; break;
      case QUEUE_STATUSES.PROCESSING: stats.processing += 1; break;
      case QUEUE_STATUSES.COMPLETED: stats.completed += 1; break;
      case QUEUE_STATUSES.FAILED_PERMANENT: stats.failedPermanent += 1; break;
      case QUEUE_STATUSES.FAILED_RETRYABLE: stats.failedRetryable += 1; break;
    }
  }

  return stats;
}
