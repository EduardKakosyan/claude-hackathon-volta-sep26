import type { BeachHistory } from './history'

/** The browser's side of /api/history/:beachId. Injectable so the hook's tests never fetch. */
export interface HistoryClient {
  load(beachId: string, signal?: AbortSignal): Promise<BeachHistory>
}

export const HISTORY_ENDPOINT = '/api/history'

export function createHistoryClient(fetchImpl: typeof fetch = (...args) => fetch(...args)): HistoryClient {
  return {
    async load(beachId, signal) {
      const res = await fetchImpl(`${HISTORY_ENDPOINT}/${encodeURIComponent(beachId)}`, { signal })
      if (!res.ok) {
        let detail = ''
        try {
          const json = (await res.json()) as { error?: unknown }
          if (typeof json.error === 'string') detail = json.error
        } catch {
          // no body: the status is the message
        }
        throw new Error(`history: answered ${res.status}${detail ? ` — ${detail}` : ''}`)
      }
      return (await res.json()) as BeachHistory
    },
  }
}
