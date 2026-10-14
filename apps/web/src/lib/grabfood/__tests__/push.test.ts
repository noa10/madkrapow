import { describe, it, expect, vi } from 'vitest'
import { pushMenuRecords, MenuPushError } from '../push'
import { GrabFoodApiError } from '../client'
import type { GrabMenuRecordUpdate } from '../types'

const NO_DELAY = vi.fn(async () => {})

function record(id: string): GrabMenuRecordUpdate {
  return { merchantID: 'mch', field: 'ITEM', id, price: 1000, availableStatus: 'AVAILABLE' }
}

function clientMock() {
  return {
    batchUpdateMenuRecords: vi.fn<(entries: Array<{ menuEntities: unknown[] }>) => Promise<void>>(
      async () => {}
    ),
  }
}

function apiError(status: number): GrabFoodApiError {
  return new GrabFoodApiError(`fail ${status}`, status, '/partner/v1/batch/menu')
}

describe('pushMenuRecords', () => {
  it('pushes all records as chunked entries and reports progress', async () => {
    const client = clientMock()
    const records = Array.from({ length: 250 }, (_, i) => record(`item-${i}`))

    const progress = await pushMenuRecords(client, records, {
      batchSize: 200,
      intervalMs: 1000,
      sleep: NO_DELAY,
    })

    expect(client.batchUpdateMenuRecords).toHaveBeenCalledTimes(2)
    const [firstCall] = client.batchUpdateMenuRecords.mock.calls[0][0]
    expect(firstCall.menuEntities).toHaveLength(200)
    expect(progress).toEqual({ pushedEntities: 250, batchesPushed: 2, batchesTotal: 2 })
  })

  it('spaces batch calls by intervalMs (Grab: 1 req/s), none after the last', async () => {
    const client = clientMock()
    const sleep = vi.fn(async () => {})
    const records = Array.from({ length: 3 }, (_, i) => record(`item-${i}`))

    await pushMenuRecords(client, records, { batchSize: 1, intervalMs: 900, sleep })

    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenNthCalledWith(1, 900)
    expect(sleep).toHaveBeenNthCalledWith(2, 900)
  })

  it('retries transient 429/5xx failures with exponential backoff', async () => {
    const client = clientMock()
    client.batchUpdateMenuRecords
      .mockRejectedValueOnce(apiError(429))
      .mockRejectedValueOnce(apiError(500))
      .mockResolvedValueOnce(undefined)
    const sleep = vi.fn(async () => {})

    const progress = await pushMenuRecords(client, [record('a')], {
      maxAttempts: 3,
      retryBaseDelayMs: 1000,
      sleep,
    })

    expect(client.batchUpdateMenuRecords).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 1000)
    expect(sleep).toHaveBeenNthCalledWith(2, 2000)
    expect(progress.batchesPushed).toBe(1)
  })

  it('does not retry permanent 4xx failures', async () => {
    const client = clientMock()
    client.batchUpdateMenuRecords.mockRejectedValueOnce(apiError(400))

    await expect(
      pushMenuRecords(client, [record('a')], { sleep: NO_DELAY })
    ).rejects.toBeInstanceOf(MenuPushError)
    expect(client.batchUpdateMenuRecords).toHaveBeenCalledTimes(1)
  })

  it('gives up after maxAttempts and reports a resumable cursor', async () => {
    const client = clientMock()
    client.batchUpdateMenuRecords.mockRejectedValue(apiError(503))
    const sleep = NO_DELAY

    // Batch 1 succeeds, batch 2 is permanently failing.
    client.batchUpdateMenuRecords.mockResolvedValueOnce(undefined)

    const promise = pushMenuRecords(client, [record('a'), record('b')], {
      batchSize: 1,
      maxAttempts: 3,
      sleep,
    })
    await expect(promise).rejects.toMatchObject({
      name: 'MenuPushError',
      message: 'Menu push failed at batch 2/2',
      progress: { pushedEntities: 1, batchesPushed: 1, batchesTotal: 2 },
    })
    // 1 success + 3 failed attempts on batch 2.
    expect(client.batchUpdateMenuRecords).toHaveBeenCalledTimes(4)
  })

  it('completes without any sleep when there is a single batch', async () => {
    const client = clientMock()
    const sleep = vi.fn(async () => {})

    await pushMenuRecords(client, [record('a')], { sleep })

    expect(sleep).not.toHaveBeenCalled()
  })
})
