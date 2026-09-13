import { describe, expect, it, vi } from 'vitest'

import { EMPTY_FOLLOWS, localFollowStorage, memoryFollowStorage, withFollow, withoutFollow } from './follow-storage'

describe('withFollow / withoutFollow', () => {
  it('adds a beach once and records the endpoint; removes a beach and keeps the endpoint', () => {
    const one = withFollow(EMPTY_FOLLOWS, 'a', 'https://push/x')
    expect(one).toEqual({ endpoint: 'https://push/x', beachIds: ['a'] })
    expect(withFollow(one, 'a', 'https://push/x').beachIds).toEqual(['a'])
    expect(withFollow(one, 'b', 'https://push/y')).toEqual({ endpoint: 'https://push/y', beachIds: ['a', 'b'] })
    expect(withoutFollow(one, 'a')).toEqual({ endpoint: 'https://push/x', beachIds: [] })
    expect(withoutFollow(one, 'zzz')).toEqual(one)
  })
})

describe('memoryFollowStorage', () => {
  it('reads what was written and tells its listeners', () => {
    const storage = memoryFollowStorage()
    const listener = vi.fn()
    const off = storage.subscribe(listener)
    expect(storage.read()).toBe(EMPTY_FOLLOWS)
    storage.write({ endpoint: 'e', beachIds: ['a'] })
    expect(storage.read()).toEqual({ endpoint: 'e', beachIds: ['a'] })
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    storage.write(EMPTY_FOLLOWS)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('localFollowStorage', () => {
  /** A localStorage the test owns, so the cases never see each other. */
  function withLocalStorage(initial: Record<string, string> = {}) {
    const items = new Map(Object.entries(initial))
    const fake = {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
    }
    vi.stubGlobal('window', { localStorage: fake, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    return { items, window: globalThis.window as unknown as { addEventListener: ReturnType<typeof vi.fn> } }
  }

  it('is empty and inert without a window', () => {
    vi.stubGlobal('window', undefined)
    const storage = localFollowStorage()
    expect(storage.read()).toBe(EMPTY_FOLLOWS)
    expect(() => storage.write({ endpoint: 'e', beachIds: [] })).not.toThrow()
    vi.unstubAllGlobals()
  })

  it('parses a stored record, ignores junk, and hands out the same object until something changes', () => {
    withLocalStorage({ 'beach-follow': JSON.stringify({ endpoint: 'https://push/x', beachIds: ['a', 7, 'b'] }) })
    const storage = localFollowStorage()
    const first = storage.read()
    expect(first).toEqual({ endpoint: 'https://push/x', beachIds: ['a', 'b'] })
    expect(storage.read()).toBe(first)
    vi.unstubAllGlobals()

    withLocalStorage({ 'beach-follow': '{not json' })
    expect(localFollowStorage().read()).toBe(EMPTY_FOLLOWS)
    vi.unstubAllGlobals()
  })

  it('writes through to localStorage and notifies; a storage event from another tab drops the cache', () => {
    const { items, window } = withLocalStorage()
    const storage = localFollowStorage()
    const listener = vi.fn()
    storage.subscribe(listener)

    storage.write({ endpoint: 'https://push/x', beachIds: ['a'] })
    expect(JSON.parse(items.get('beach-follow')!)).toEqual({ endpoint: 'https://push/x', beachIds: ['a'] })
    expect(listener).toHaveBeenCalledTimes(1)

    // Another tab wrote: the next read re-parses.
    items.set('beach-follow', JSON.stringify({ endpoint: 'https://push/x', beachIds: ['a', 'b'] }))
    const onStorage = window.addEventListener.mock.calls.find(([type]) => type === 'storage')![1] as (e: { key: string | null }) => void
    onStorage({ key: 'beach-follow' })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(storage.read().beachIds).toEqual(['a', 'b'])
    vi.unstubAllGlobals()
  })
})
