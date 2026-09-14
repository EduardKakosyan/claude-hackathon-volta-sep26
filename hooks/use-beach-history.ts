'use client'

import { useEffect, useMemo, useState } from 'react'

import type { BeachHistory } from '@/lib/history'
import { createHistoryClient, type HistoryClient } from '@/lib/history-client'

export type BeachHistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface BeachHistoryState {
  status: BeachHistoryStatus
  history: BeachHistory | null
  error: string | null
}

export interface UseBeachHistoryDeps {
  client?: HistoryClient
  /** Injected by tests: a fresh cache per test rather than the module's. */
  cache?: Map<string, BeachHistory>
}

/** What the last fetch answered, for the one beach it was about. */
interface Answer {
  beachId: string
  history: BeachHistory | null
  error: string | null
}

let defaultClient: HistoryClient | null = null
/** Once a beach's year has arrived it is kept for the session: reopening it is instant, and the CDN is asked once. */
const defaultCache = new Map<string, BeachHistory>()

const IDLE: BeachHistoryState = { status: 'idle', history: null, error: null }
const LOADING: BeachHistoryState = { status: 'loading', history: null, error: null }

/**
 * The season of the open beach, fetched the moment it opens and never before:
 * the page never carries every beach's year. The state is derived on each
 * render from the cache and the last answer, so a change of beach is read
 * at once; the effect only starts a fetch, and a fetch whose beach has since
 * closed is abandoned. A beach already seen answers from the cache without one.
 */
export function useBeachHistory(beachId: string | null, deps: UseBeachHistoryDeps = {}): BeachHistoryState {
  const client = useMemo(() => deps.client ?? (defaultClient ??= createHistoryClient()), [deps.client])
  const cache = deps.cache ?? defaultCache
  const [answer, setAnswer] = useState<Answer | null>(null)

  useEffect(() => {
    if (!beachId || cache.has(beachId)) return
    const controller = new AbortController()
    client
      .load(beachId, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) return
        cache.set(beachId, history)
        setAnswer({ beachId, history, error: null })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setAnswer({ beachId, history: null, error: err instanceof Error ? err.message : String(err) })
      })
    return () => controller.abort()
  }, [beachId, client, cache])

  if (!beachId) return IDLE
  const cached = cache.get(beachId)
  if (cached) return { status: 'ready', history: cached, error: null }
  if (answer?.beachId === beachId && answer.error) return { status: 'error', history: null, error: answer.error }
  return LOADING
}
