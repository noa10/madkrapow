/**
 * Throttled menu-record push (closes the documented "menu sync unthrottled"
 * gap): Grab documents 1 req/s on PUT /partner/v1/batch/menu, so batches are
 * spaced, transient failures (429/5xx) are retried with exponential backoff,
 * and progress is reported so a permanent failure leaves a resumable cursor
 * (records are pushed in deterministic order).
 */

import type { GrabFoodClient } from './client'
import { GrabFoodApiError } from './client'
import { toBatchMenuEntries } from './menu'
import type { GrabMenuRecordUpdate } from './types'

export interface MenuPushOptions {
  /** Max menuEntities per batch entry (Grab's documented limit: 200). */
  batchSize?: number
  /** Spacing between successful batch calls (Grab: 1 req/s). */
  intervalMs?: number
  /** Attempts per batch before giving up (1 = no retry). */
  maxAttempts?: number
  /** Backoff base for retries: base * 2^(attempt-1). */
  retryBaseDelayMs?: number
  /** Injectable delay (tests pass an instant no-op). */
  sleep?: (ms: number) => Promise<void>
}

export interface MenuPushProgress {
  /** Entities confirmed pushed (batches that returned without throwing). */
  pushedEntities: number
  batchesPushed: number
  batchesTotal: number
}

export class MenuPushError extends Error {
  readonly progress: MenuPushProgress
  readonly cause?: unknown

  constructor(message: string, progress: MenuPushProgress, cause?: unknown) {
    super(message)
    this.name = 'MenuPushError'
    this.progress = progress
    this.cause = cause
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function isTransient(status: number): boolean {
  return status === 429 || status >= 500
}

export async function pushMenuRecords(
  client: Pick<GrabFoodClient, 'batchUpdateMenuRecords'>,
  records: GrabMenuRecordUpdate[],
  options: MenuPushOptions = {}
): Promise<MenuPushProgress> {
  const batchSize = options.batchSize ?? 200
  const intervalMs = options.intervalMs ?? 1000
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  const retryBaseDelayMs = options.retryBaseDelayMs ?? 1000
  const sleep = options.sleep ?? defaultSleep

  const entries = toBatchMenuEntries(records, batchSize)
  const progress: MenuPushProgress = {
    pushedEntities: 0,
    batchesPushed: 0,
    batchesTotal: entries.length,
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await client.batchUpdateMenuRecords([entry])
        progress.batchesPushed += 1
        progress.pushedEntities += entry.menuEntities.length
        lastError = undefined
        break
      } catch (err) {
        lastError = err
        const transient = err instanceof GrabFoodApiError && isTransient(err.status)
        // Non-transient (4xx) failures will not improve with a retry.
        if (!transient || attempt === maxAttempts) break
        await sleep(retryBaseDelayMs * 2 ** (attempt - 1))
      }
    }
    if (lastError !== undefined) {
      throw new MenuPushError(
        `Menu push failed at batch ${i + 1}/${entries.length}`,
        progress,
        lastError
      )
    }
    // Space batches out, but never sleep after the final batch.
    if (i < entries.length - 1) {
      await sleep(intervalMs)
    }
  }

  return progress
}
