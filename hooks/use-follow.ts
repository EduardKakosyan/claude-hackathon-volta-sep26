'use client'

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { browserPushPort, readVapidPublicKey, type PushPort, type PushSupport } from '@/lib/push/browser'
import { createFollowClient, type FollowClient } from '@/lib/push/client'
import {
  EMPTY_FOLLOWS,
  localFollowStorage,
  withFollow,
  withoutFollow,
  type FollowRecord,
  type FollowStorage,
} from '@/lib/push/follow-storage'

/** What the bell shows for one beach. */
export type FollowState = 'off' | 'on' | 'blocked' | 'needs-install' | 'unsupported'

export interface UseFollowDeps {
  client?: FollowClient
  push?: PushPort
  storage?: FollowStorage
  /** The VAPID public key; read from the page's meta tag when omitted. */
  publicKey?: string | null
}

export interface UseFollowResult {
  support: PushSupport
  followed: readonly string[]
  /** A follow or unfollow is in flight; the bell is inert meanwhile. */
  busy: boolean
  /** The last toggle's failure, for the bell to say so; cleared by the next toggle. */
  error: string | null
  stateOf(beachId: string): FollowState
  toggle(beachId: string): Promise<void>
}

let defaultPort: PushPort | null = null
let defaultStorage: FollowStorage | null = null
let defaultClient: FollowClient | null = null

function subscribeToNothing() {
  return () => {}
}

const serverSupport = (): PushSupport => 'unsupported'
const serverFollows = (): FollowRecord => EMPTY_FOLLOWS

/**
 * Following a beach, per device: the state per beach comes from localStorage
 * (a mirror of what the server holds for this browser's subscription), and a
 * toggle walks the whole path — service worker, permission, subscription,
 * /api/follow — or explains why it cannot ('blocked', 'needs-install',
 * 'unsupported'). Nothing runs on load: the service worker is registered on
 * the first tap, never before.
 */
export function useFollow(deps: UseFollowDeps = {}): UseFollowResult {
  const push = useMemo(() => deps.push ?? (defaultPort ??= browserPushPort()), [deps.push])
  const storage = useMemo(() => deps.storage ?? (defaultStorage ??= localFollowStorage()), [deps.storage])
  const client = useMemo(() => deps.client ?? (defaultClient ??= createFollowClient()), [deps.client])
  const publicKey = deps.publicKey

  // Both snapshots are read through useSyncExternalStore so the server render
  // and the hydration render agree ('unsupported', nothing followed) and the
  // browser's answer lands in the render right after.
  const readSupport = useCallback(() => push.support(), [push])
  const support = useSyncExternalStore(subscribeToNothing, readSupport, serverSupport)
  const follows = useSyncExternalStore(storage.subscribe, storage.read, serverFollows)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * The person refused the permission prompt (or had already blocked the site,
   * in which case the browser answers "denied" without showing one). Known only
   * by asking: `Notification.permission` is not read up front — headless
   * Chromium reports "denied" there even when the permission is granted.
   */
  const [denied, setDenied] = useState(false)
  const inFlight = useRef(false)

  const stateOf = useCallback(
    (beachId: string): FollowState => {
      if (support !== 'supported') return support
      if (denied) return 'blocked'
      return follows.beachIds.includes(beachId) ? 'on' : 'off'
    },
    [support, denied, follows],
  )

  const toggle = useCallback(
    async (beachId: string) => {
      if (inFlight.current) return
      const state = stateOf(beachId)
      if (state !== 'on' && state !== 'off') return
      inFlight.current = true
      setBusy(true)
      setError(null)
      try {
        if (state === 'on') {
          const endpoint = storage.read().endpoint
          if (endpoint) await client.unfollow(endpoint, beachId)
          storage.write(withoutFollow(storage.read(), beachId))
          return
        }
        const permission = await push.requestPermission()
        if (permission === 'denied') {
          setDenied(true)
          return
        }
        if (permission !== 'granted') return // a dismissed prompt: still off, ask again next tap
        const key = publicKey === undefined ? readVapidPublicKey() : publicKey
        if (!key) throw new Error('push: this page has no public key to subscribe with')
        const subscription = await push.subscribe(key)
        await client.follow(subscription, beachId)
        storage.write(withFollow(storage.read(), beachId, subscription.endpoint))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [stateOf, storage, client, push, publicKey],
  )

  return { support, followed: follows.beachIds, busy, error, stateOf, toggle }
}
