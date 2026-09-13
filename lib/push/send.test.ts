import { describe, expect, it, vi } from 'vitest'

import type { StatusTransition } from '@/lib/ingest/refresh-live'
import type { LiveStatus } from '@/lib/status'

import type { PushSubscriptionInput } from './follow-store'
import { MemoryFollowStore } from './memory-follow-store'
import { PushSendError, pushMessage, sendTransitions, type PushSender } from './send'
import { BEACHES_BY_ID } from '@/lib/seed/beaches'

const NOW = () => new Date('2026-08-15T15:00:00.000Z')

const live = (beachId: string, state: LiveStatus['state'], overrides: Partial<LiveStatus> = {}): LiveStatus => ({
  kind: 'live',
  beachId,
  state,
  source: 'hrm',
  verbatim: 'Risk advisory in effect',
  sourceUrl: 'https://www.halifax.ca/x',
  postedAt: '2026-08-15T11:02:00.000Z',
  confirmedAt: '2026-08-15T12:00:00.000Z',
  ...overrides,
})

const transition = (beachId: string, from: StatusTransition['from'], to: StatusTransition['to']): StatusTransition => ({
  beachId,
  from,
  to,
  status: live(beachId, to),
})

const sub = (n: string): PushSubscriptionInput => ({ endpoint: `https://push.example.org/${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` } })

/** A sender that records every call and answers per endpoint. */
function fakeSender(answer: (endpoint: string) => number | null = () => null) {
  const calls: { endpoint: string; payload: unknown }[] = []
  const sender: PushSender = {
    send: vi.fn(async (subscription, payload) => {
      calls.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) })
      const code = answer(subscription.endpoint)
      if (code !== null) throw new PushSendError(`push service answered ${code}`, code)
    }),
  }
  return { sender, calls }
}

describe('sendTransitions', () => {
  it('sends one notification per follower per transitioned beach, in the words lib/copy builds', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(sub('one'), 'hrm-chocolate-lake')
    await store.subscribe(sub('two'), 'hrm-chocolate-lake')
    await store.subscribe(sub('two'), 'ns-rissers')
    await store.subscribe(sub('three'), 'hrm-albro-lake') // follows a beach that did not change
    const { sender, calls } = fakeSender()

    const result = await sendTransitions({
      transitions: [transition('hrm-chocolate-lake', 'open', 'advisory'), transition('ns-rissers', 'offseason', 'open')],
      store,
      sender,
      now: NOW,
    })

    expect(result).toEqual({ sent: 3, removed: 0, failed: 0 })
    expect(calls.map((c) => c.endpoint).sort()).toEqual([
      'https://push.example.org/one',
      'https://push.example.org/two',
      'https://push.example.org/two',
    ])
    const chocolate = calls.find((c) => c.endpoint.endsWith('/one'))!.payload
    expect(chocolate).toEqual({
      title: 'Chocolate Lake Beach is now Advisory',
      body: 'halifax.ca: “Risk advisory in effect” Posted today, 8:02 a.m.',
      beachId: 'hrm-chocolate-lake',
      url: '/?beach=hrm-chocolate-lake',
    })
  })

  it('sends nothing, and reads nothing, when no state changed', async () => {
    const store = new MemoryFollowStore()
    const followersOf = vi.spyOn(store, 'followersOf')
    const { sender } = fakeSender()
    expect(await sendTransitions({ transitions: [], store, sender })).toEqual({ sent: 0, removed: 0, failed: 0 })
    expect(followersOf).not.toHaveBeenCalled()
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('with no VAPID keys it skips, says so, and keeps every subscription', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(sub('one'), 'hrm-chocolate-lake')
    const log = vi.fn()
    const result = await sendTransitions({ transitions: [transition('hrm-chocolate-lake', 'open', 'closed')], store, sender: null, log })
    expect(result).toEqual({ sent: 0, removed: 0, failed: 0, skipped: 'no VAPID keys configured' })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not sent'))
    expect(store.subscriptions.size).toBe(1)
  })

  it('a 410 or 404 from the push service removes that subscription and all of its follows, once', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(sub('gone'), 'hrm-chocolate-lake')
    await store.subscribe(sub('gone'), 'ns-rissers')
    await store.subscribe(sub('lost'), 'hrm-chocolate-lake')
    await store.subscribe(sub('fine'), 'hrm-chocolate-lake')
    const { sender, calls } = fakeSender((endpoint) => (endpoint.endsWith('/gone') ? 410 : endpoint.endsWith('/lost') ? 404 : null))

    const result = await sendTransitions({
      transitions: [transition('hrm-chocolate-lake', 'open', 'closed'), transition('ns-rissers', 'open', 'advisory')],
      store,
      sender,
      now: NOW,
    })

    expect(result).toEqual({ sent: 1, removed: 2, failed: 0 })
    expect(store.subscriptions.has('https://push.example.org/gone')).toBe(false)
    expect(store.subscriptions.has('https://push.example.org/lost')).toBe(false)
    expect(store.subscriptions.has('https://push.example.org/fine')).toBe(true)
    // The gone endpoint was tried once, not once per beach it followed.
    expect(calls.filter((c) => c.endpoint.endsWith('/gone'))).toHaveLength(1)
  })

  it('any other failure is logged and counted, the subscription kept, and nothing thrown', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(sub('busy'), 'hrm-chocolate-lake')
    await store.subscribe(sub('fine'), 'hrm-chocolate-lake')
    const log = vi.fn()
    const sender: PushSender = {
      send: vi.fn(async (subscription) => {
        if (subscription.endpoint.endsWith('/busy')) throw new PushSendError('push service answered 429', 429)
        if (subscription.endpoint.endsWith('/fine')) throw new TypeError('fetch failed')
      }),
    }

    const result = await sendTransitions({ transitions: [transition('hrm-chocolate-lake', 'open', 'closed')], store, sender, log })

    expect(result).toEqual({ sent: 0, removed: 0, failed: 2 })
    expect(store.subscriptions.size).toBe(2)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('HTTP 429'), expect.any(PushSendError))
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/send failed for hrm-chocolate-lake$/), expect.any(TypeError))
  })

  it('a follower of a beach that is not on the roster is skipped rather than sent nonsense', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(sub('one'), 'hrm-nowhere')
    const { sender } = fakeSender()
    const result = await sendTransitions({ transitions: [transition('hrm-nowhere', 'open', 'closed')], store, sender })
    expect(result).toEqual({ sent: 0, removed: 0, failed: 0 })
    expect(sender.send).not.toHaveBeenCalled()
  })
})

describe('pushMessage', () => {
  it('carries the deep link the service worker opens on a tap', () => {
    const message = pushMessage(BEACHES_BY_ID['ns-rissers'], transition('ns-rissers', 'offseason', 'open'), NOW())
    expect(message.url).toBe('/?beach=ns-rissers')
    expect(message.beachId).toBe('ns-rissers')
  })
})
