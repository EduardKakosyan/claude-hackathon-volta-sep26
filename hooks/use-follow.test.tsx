import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useFollow } from '@/hooks/use-follow'
import type { PushPort, PushSupport } from '@/lib/push/browser'
import type { FollowClient } from '@/lib/push/client'
import type { PushSubscriptionInput } from '@/lib/push/follow-store'
import { memoryFollowStorage } from '@/lib/push/follow-storage'

const SUB: PushSubscriptionInput = { endpoint: 'https://push.example.org/one', keys: { p256dh: 'p', auth: 'a' } }

/** A browser that answers as told: the permission the prompt returns, and the subscription it issues. */
function fakePort(overrides: Partial<{ support: PushSupport; permission: NotificationPermission; subscription: PushSubscriptionInput }> = {}) {
  const support: PushSupport = overrides.support ?? 'supported'
  const permission = overrides.permission ?? 'granted'
  const port: PushPort = {
    support: vi.fn(() => support),
    requestPermission: vi.fn(async () => permission),
    subscribe: vi.fn(async () => overrides.subscription ?? SUB),
  }
  return port
}

function fakeClient(): FollowClient & { follow: ReturnType<typeof vi.fn>; unfollow: ReturnType<typeof vi.fn> } {
  return { follow: vi.fn(async () => {}), unfollow: vi.fn(async () => {}) }
}

describe('useFollow', () => {
  it('starts off for every beach when the browser supports push and nothing is followed', () => {
    const { result } = renderHook(() => useFollow({ push: fakePort(), client: fakeClient(), storage: memoryFollowStorage(), publicKey: 'key' }))
    expect(result.current.support).toBe('supported')
    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('off')
    expect(result.current.followed).toEqual([])
    expect(result.current.busy).toBe(false)
  })

  it('reads what is already followed from storage, and only that beach is on', () => {
    const storage = memoryFollowStorage({ endpoint: SUB.endpoint, beachIds: ['ns-rissers'] })
    const { result } = renderHook(() => useFollow({ push: fakePort(), client: fakeClient(), storage, publicKey: 'key' }))
    expect(result.current.stateOf('ns-rissers')).toBe('on')
    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('off')
  })

  it('toggle off → on: asks permission, subscribes with the page key, posts the follow, and remembers the endpoint', async () => {
    const push = fakePort()
    const client = fakeClient()
    const storage = memoryFollowStorage()
    const { result } = renderHook(() => useFollow({ push, client, storage, publicKey: 'BPageKey' }))

    await act(() => result.current.toggle('hrm-chocolate-lake'))

    expect(push.requestPermission).toHaveBeenCalledTimes(1)
    expect(push.subscribe).toHaveBeenCalledWith('BPageKey')
    expect(client.follow).toHaveBeenCalledWith(SUB, 'hrm-chocolate-lake')
    expect(storage.read()).toEqual({ endpoint: SUB.endpoint, beachIds: ['hrm-chocolate-lake'] })
    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('on')
    expect(result.current.error).toBeNull()
    expect(result.current.busy).toBe(false)
  })

  it('a second beach reuses the subscription: no second prompt is needed, the endpoint is the same', async () => {
    const push = fakePort()
    const client = fakeClient()
    const storage = memoryFollowStorage()
    const { result } = renderHook(() => useFollow({ push, client, storage, publicKey: 'k' }))

    await act(() => result.current.toggle('hrm-chocolate-lake'))
    await act(() => result.current.toggle('ns-rissers'))

    expect(client.follow).toHaveBeenCalledTimes(2)
    expect(storage.read().beachIds).toEqual(['hrm-chocolate-lake', 'ns-rissers'])
    expect(result.current.followed).toEqual(['hrm-chocolate-lake', 'ns-rissers'])
  })

  it('toggle on → off: deletes the follow on the server with the stored endpoint and forgets the beach', async () => {
    const client = fakeClient()
    const storage = memoryFollowStorage({ endpoint: SUB.endpoint, beachIds: ['hrm-chocolate-lake', 'ns-rissers'] })
    const push = fakePort()
    const { result } = renderHook(() => useFollow({ push, client, storage, publicKey: 'k' }))

    await act(() => result.current.toggle('ns-rissers'))

    expect(client.unfollow).toHaveBeenCalledWith(SUB.endpoint, 'ns-rissers')
    expect(push.requestPermission).not.toHaveBeenCalled()
    expect(storage.read()).toEqual({ endpoint: SUB.endpoint, beachIds: ['hrm-chocolate-lake'] })
    expect(result.current.stateOf('ns-rissers')).toBe('off')
    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('on')
  })

  it('a refused permission reads as blocked afterwards — for every beach — and nothing was subscribed or posted', async () => {
    const push = fakePort({ permission: 'denied' })
    const client = fakeClient()
    const { result } = renderHook(() => useFollow({ push, client, storage: memoryFollowStorage(), publicKey: 'k' }))

    await act(() => result.current.toggle('hrm-chocolate-lake'))

    expect(push.subscribe).not.toHaveBeenCalled()
    expect(client.follow).not.toHaveBeenCalled()
    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('blocked')
    expect(result.current.stateOf('ns-rissers')).toBe('blocked')
    expect(result.current.error).toBeNull()
  })

  it('nothing is asked or read on mount: the prompt and the service worker wait for the first tap', () => {
    const push = fakePort()
    renderHook(() => useFollow({ push, client: fakeClient(), storage: memoryFollowStorage(), publicKey: 'k' }))
    expect(push.requestPermission).not.toHaveBeenCalled()
    expect(push.subscribe).not.toHaveBeenCalled()
  })

  it('a dismissed prompt ("default") leaves the bell off with no error, ready to ask again', async () => {
    const push = fakePort({ permission: 'default' })
    const { result } = renderHook(() => useFollow({ push, client: fakeClient(), storage: memoryFollowStorage(), publicKey: 'k' }))

    await act(() => result.current.toggle('hrm-chocolate-lake'))

    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('off')
    expect(result.current.error).toBeNull()
    await act(() => result.current.toggle('hrm-chocolate-lake'))
    expect(push.requestPermission).toHaveBeenCalledTimes(2)
  })

  it('iOS Safari in a tab is needs-install: a toggle does nothing, the bell explains instead', async () => {
    const push = fakePort({ support: 'needs-install' })
    const client = fakeClient()
    const { result } = renderHook(() => useFollow({ push, client, storage: memoryFollowStorage(), publicKey: 'k' }))

    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('needs-install')
    await act(() => result.current.toggle('hrm-chocolate-lake'))
    expect(push.requestPermission).not.toHaveBeenCalled()
    expect(client.follow).not.toHaveBeenCalled()
  })

  it('no Push API and no install path is unsupported', () => {
    const { result } = renderHook(() => useFollow({ push: fakePort({ support: 'unsupported' }), client: fakeClient(), storage: memoryFollowStorage(), publicKey: 'k' }))
    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('unsupported')
  })

  it('a failed server call leaves the bell off with the error, and storage untouched', async () => {
    const client = fakeClient()
    client.follow.mockRejectedValue(new Error('follow: POST answered 503 — database not configured'))
    const storage = memoryFollowStorage()
    const { result } = renderHook(() => useFollow({ push: fakePort(), client, storage, publicKey: 'k' }))

    await act(() => result.current.toggle('hrm-chocolate-lake'))

    expect(result.current.stateOf('hrm-chocolate-lake')).toBe('off')
    expect(result.current.error).toBe('follow: POST answered 503 — database not configured')
    expect(storage.read().beachIds).toEqual([])
    expect(result.current.busy).toBe(false)
  })

  it('a page with no public key cannot subscribe, and says so', async () => {
    const push = fakePort()
    const { result } = renderHook(() => useFollow({ push, client: fakeClient(), storage: memoryFollowStorage(), publicKey: null }))
    await act(() => result.current.toggle('hrm-chocolate-lake'))
    expect(push.subscribe).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/no public key/)
  })

  it('is busy while a toggle is in flight, and a second toggle meanwhile is ignored', async () => {
    let release!: (value: NotificationPermission) => void
    const push = fakePort()
    ;(push.requestPermission as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise<NotificationPermission>((resolve) => (release = resolve)),
    )
    const client = fakeClient()
    const { result } = renderHook(() => useFollow({ push, client, storage: memoryFollowStorage(), publicKey: 'k' }))

    let first!: Promise<void>
    act(() => {
      first = result.current.toggle('hrm-chocolate-lake')
    })
    await waitFor(() => expect(result.current.busy).toBe(true))
    await act(() => result.current.toggle('hrm-chocolate-lake'))
    expect(push.requestPermission).toHaveBeenCalledTimes(1)

    await act(async () => {
      release('granted')
      await first
    })
    expect(result.current.busy).toBe(false)
    expect(client.follow).toHaveBeenCalledTimes(1)
  })

  it('reflects a change another tab made to storage', async () => {
    const storage = memoryFollowStorage()
    const { result } = renderHook(() => useFollow({ push: fakePort(), client: fakeClient(), storage, publicKey: 'k' }))
    expect(result.current.stateOf('ns-rissers')).toBe('off')
    act(() => storage.write({ endpoint: SUB.endpoint, beachIds: ['ns-rissers'] }))
    expect(result.current.stateOf('ns-rissers')).toBe('on')
  })
})
