import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useBeachHistory } from '@/hooks/use-beach-history'
import type { BeachHistory } from '@/lib/history'
import type { HistoryClient } from '@/lib/history-client'

const HISTORY: BeachHistory = {
  beachId: 'hrm-kinap',
  from: '2026-07-01',
  to: '2026-07-02',
  spans: [{ from: '2026-07-01', to: '2026-07-02', state: 'open', basis: 'inferred', note: null }],
}

/** A client that answers what it is told, when it is told to. */
function fakeClient(answer: (beachId: string) => Promise<BeachHistory> = async (beachId) => ({ ...HISTORY, beachId })) {
  const load = vi.fn((beachId: string, signal?: AbortSignal) => {
    void signal // recorded on the call for the abandon test to read
    return answer(beachId)
  })
  const client: HistoryClient = { load }
  return { client, load }
}

describe('useBeachHistory', () => {
  it('is idle with no beach, and asks nothing', () => {
    const { client, load } = fakeClient()
    const { result } = renderHook(() => useBeachHistory(null, { client, cache: new Map() }))
    expect(result.current).toEqual({ status: 'idle', history: null, error: null })
    expect(load).not.toHaveBeenCalled()
  })

  it('loads the open beach once and reads it back from the cache when it reopens', async () => {
    const { client, load } = fakeClient()
    const cache = new Map<string, BeachHistory>()
    const { result, rerender } = renderHook(({ id }) => useBeachHistory(id, { client, cache }), {
      initialProps: { id: 'hrm-kinap' as string | null },
    })
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.history?.beachId).toBe('hrm-kinap')
    expect(load).toHaveBeenCalledTimes(1)

    rerender({ id: null })
    expect(result.current.status).toBe('idle')
    rerender({ id: 'hrm-kinap' })
    expect(result.current.status).toBe('ready')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('abandons a load when the beach changes before it answers', async () => {
    let resolveFirst!: (h: BeachHistory) => void
    const { client, load } = fakeClient((beachId) =>
      beachId === 'hrm-kinap'
        ? new Promise<BeachHistory>((resolve) => {
            resolveFirst = resolve
          })
        : Promise.resolve({ ...HISTORY, beachId }),
    )
    const cache = new Map<string, BeachHistory>()
    const { result, rerender } = renderHook(({ id }) => useBeachHistory(id, { client, cache }), {
      initialProps: { id: 'hrm-kinap' },
    })
    rerender({ id: 'ns-rissers' })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.history?.beachId).toBe('ns-rissers')
    expect(load.mock.calls[0][1]?.aborted).toBe(true)

    // The first answer arrives late and changes nothing.
    resolveFirst({ ...HISTORY, beachId: 'hrm-kinap' })
    await new Promise((r) => setTimeout(r, 0))
    expect(result.current.history?.beachId).toBe('ns-rissers')
    expect(cache.has('hrm-kinap')).toBe(false)
  })

  it('reports a failed load with its message and caches nothing', async () => {
    const { client } = fakeClient(async () => {
      throw new Error('history: answered 503 — database not configured')
    })
    const cache = new Map<string, BeachHistory>()
    const { result } = renderHook(() => useBeachHistory('hrm-kinap', { client, cache }))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBe('history: answered 503 — database not configured')
    expect(cache.size).toBe(0)
  })
})
