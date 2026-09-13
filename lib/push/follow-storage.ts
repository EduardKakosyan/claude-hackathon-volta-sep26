/**
 * What this browser follows, mirrored from the server so the bell knows its
 * state without a read: the push endpoint the subscription was stored under
 * and the beach ids. Kept in localStorage; a memory version for tests. The
 * shape is an external store so React can read it with useSyncExternalStore
 * and never sees a different value on the server than on first paint.
 */
export interface FollowRecord {
  endpoint: string | null
  beachIds: readonly string[]
}

export interface FollowStorage {
  read(): FollowRecord
  write(record: FollowRecord): void
  subscribe(listener: () => void): () => void
}

export const EMPTY_FOLLOWS: FollowRecord = Object.freeze({ endpoint: null, beachIds: Object.freeze([]) as readonly string[] })

export const FOLLOW_STORAGE_KEY = 'beach-follow'

function parse(raw: string | null): FollowRecord {
  if (!raw) return EMPTY_FOLLOWS
  try {
    const value = JSON.parse(raw) as { endpoint?: unknown; beachIds?: unknown }
    const endpoint = typeof value.endpoint === 'string' ? value.endpoint : null
    const beachIds = Array.isArray(value.beachIds) ? value.beachIds.filter((id): id is string => typeof id === 'string') : []
    return { endpoint, beachIds }
  } catch {
    return EMPTY_FOLLOWS
  }
}

export function memoryFollowStorage(initial: FollowRecord = EMPTY_FOLLOWS): FollowStorage {
  let record = initial
  const listeners = new Set<() => void>()
  return {
    read: () => record,
    write(next) {
      record = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * localStorage, read once and cached so `read()` hands React the same object
 * until something changes: a write here, or a `storage` event from another tab.
 * Without a window (the server) it is empty and never writes.
 */
export function localFollowStorage(key: string = FOLLOW_STORAGE_KEY): FollowStorage {
  let cached: FollowRecord | null = null
  const listeners = new Set<() => void>()

  function storage(): Storage | null {
    try {
      return typeof window === 'undefined' ? null : window.localStorage
    } catch {
      return null // privacy mode can throw on access
    }
  }

  function notify() {
    for (const listener of listeners) listener()
  }

  return {
    read() {
      if (cached) return cached
      const store = storage()
      cached = store ? parse(store.getItem(key)) : EMPTY_FOLLOWS
      return cached
    },
    write(record) {
      cached = record
      try {
        storage()?.setItem(key, JSON.stringify(record))
      } catch {
        // quota or privacy mode: the in-memory copy still serves this session
      }
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) {
          cached = null
          notify()
        }
      }
      if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(listener)
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
      }
    },
  }
}

/** The record with one beach added or removed. */
export function withFollow(record: FollowRecord, beachId: string, endpoint: string): FollowRecord {
  return { endpoint, beachIds: record.beachIds.includes(beachId) ? record.beachIds : [...record.beachIds, beachId] }
}

export function withoutFollow(record: FollowRecord, beachId: string): FollowRecord {
  return { endpoint: record.endpoint, beachIds: record.beachIds.filter((id) => id !== beachId) }
}
