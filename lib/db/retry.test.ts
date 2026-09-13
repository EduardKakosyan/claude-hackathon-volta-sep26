import { describe, expect, it, vi } from 'vitest'

import { withRetry } from './retry'

const noSleep = { delaysMs: [10, 20], sleep: vi.fn<(ms: number) => Promise<void>>(async () => {}) }

describe('withRetry', () => {
  it('returns the data of the first clean answer', async () => {
    const query = vi.fn(async () => ({ data: [1], error: null }))
    expect(await withRetry('x', query, noSleep)).toEqual([1])
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('sleeps the given delays between tries and returns the answer that finally comes', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
    const query = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: '504' } })
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ data: 'ok', error: null })
    expect(await withRetry('beaches upsert', query, { delaysMs: [10, 20], sleep })).toBe('ok')
    expect(query).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20])
  })

  it('builds a fresh query per attempt, and gives up with the last error named after the op', async () => {
    const query = vi.fn(async () => ({ data: null, error: { message: 'still 504' } }))
    await expect(withRetry('status_day upsert', query, noSleep)).rejects.toThrow(
      'supabase status_day upsert: still 504',
    )
    expect(query).toHaveBeenCalledTimes(3)
  })
})
