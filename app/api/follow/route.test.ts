import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryFollowStore } from '@/lib/push/memory-follow-store'

/**
 * The follow route against the memory store: what it accepts, what it refuses
 * by name, and that a subscribe lands in the store and an unsubscribe leaves
 * it. `getFollowStore` is the only thing replaced.
 */
let store = new MemoryFollowStore()
const getFollowStore = vi.fn(() => store)
vi.mock('@/lib/db/client', () => ({ getFollowStore: () => getFollowStore() }))

const { POST, DELETE } = await import('./route')

const SUB = {
  endpoint: 'https://push.example.org/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'BPubKey', auth: 'authSecret' },
}

const json = (method: 'POST' | 'DELETE', body: unknown) =>
  new Request('http://localhost/api/follow', {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

describe('/api/follow', () => {
  beforeEach(() => {
    store = new MemoryFollowStore()
    getFollowStore.mockImplementation(() => store)
  })

  describe('POST', () => {
    it('stores the subscription with the beach and answers 204 with no body', async () => {
      const res = await POST(json('POST', { subscription: SUB, beachId: 'hrm-chocolate-lake' }))
      expect(res.status).toBe(204)
      expect(await res.text()).toBe('')

      expect(await store.followersOf(['hrm-chocolate-lake'])).toEqual([
        { endpoint: SUB.endpoint, keys: SUB.keys, beachId: 'hrm-chocolate-lake' },
      ])
    })

    it('is idempotent: the same pair twice is one follower', async () => {
      await POST(json('POST', { subscription: SUB, beachId: 'hrm-chocolate-lake' }))
      await POST(json('POST', { subscription: SUB, beachId: 'hrm-chocolate-lake' }))
      expect(await store.followersOf(['hrm-chocolate-lake'])).toHaveLength(1)
    })

    it('refuses a body that is not JSON, or not an object', async () => {
      expect((await POST(json('POST', 'not json'))).status).toBe(400)
      expect((await POST(json('POST', [1, 2]))).status).toBe(400)
      expect((await POST(json('POST', 'null'))).status).toBe(400)
    })

    it('refuses a subscription without an https endpoint or without both keys, naming the problem', async () => {
      const cases = [
        { ...SUB, endpoint: 'http://push.example.org/insecure' },
        { ...SUB, endpoint: 'not a url' },
        { ...SUB, keys: { p256dh: 'x' } },
        { ...SUB, keys: { p256dh: '', auth: 'y' } },
        { endpoint: SUB.endpoint },
        'https://push.example.org/send/abc123',
      ]
      for (const subscription of cases) {
        const res = await POST(json('POST', { subscription, beachId: 'hrm-chocolate-lake' }))
        expect(res.status, JSON.stringify(subscription)).toBe(400)
        expect(await res.json()).toEqual({ error: expect.stringMatching(/subscription/) })
      }
      expect(store.subscriptions.size).toBe(0)
    })

    it('refuses a beach that is not on the roster', async () => {
      const res = await POST(json('POST', { subscription: SUB, beachId: 'hrm-nowhere' }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'beachId is not a monitored beach' })
      expect(store.subscriptions.size).toBe(0)
    })

    it('answers 503 when there is no store to write to', async () => {
      getFollowStore.mockImplementation(() => {
        throw new Error('production has no database')
      })
      const res = await POST(json('POST', { subscription: SUB, beachId: 'hrm-chocolate-lake' }))
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ error: 'database not configured' })
    })

    it('a store that throws is a 500 with the message, not a crash', async () => {
      store.subscribe = async () => {
        throw new Error('supabase push_subscription upsert: down')
      }
      const res = await POST(json('POST', { subscription: SUB, beachId: 'hrm-chocolate-lake' }))
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'supabase push_subscription upsert: down' })
    })
  })

  describe('DELETE', () => {
    it('drops the follow, and the subscription with it when it was the last, answering 204', async () => {
      await store.subscribe(SUB, 'hrm-chocolate-lake')
      await store.subscribe(SUB, 'ns-rissers')

      const first = await DELETE(json('DELETE', { endpoint: SUB.endpoint, beachId: 'hrm-chocolate-lake' }))
      expect(first.status).toBe(204)
      expect(await store.followersOf(['hrm-chocolate-lake'])).toEqual([])
      expect(store.subscriptions.has(SUB.endpoint)).toBe(true)

      const last = await DELETE(json('DELETE', { endpoint: SUB.endpoint, beachId: 'ns-rissers' }))
      expect(last.status).toBe(204)
      expect(store.subscriptions.has(SUB.endpoint)).toBe(false)
    })

    it('an unknown pair is still a 204: unfollowing twice is not an error', async () => {
      const res = await DELETE(json('DELETE', { endpoint: SUB.endpoint, beachId: 'hrm-chocolate-lake' }))
      expect(res.status).toBe(204)
    })

    it('refuses a missing or non-https endpoint and an unknown beach', async () => {
      expect((await DELETE(json('DELETE', { beachId: 'hrm-chocolate-lake' }))).status).toBe(400)
      expect((await DELETE(json('DELETE', { endpoint: 'http://x', beachId: 'hrm-chocolate-lake' }))).status).toBe(400)
      expect((await DELETE(json('DELETE', { endpoint: SUB.endpoint, beachId: 'nope' }))).status).toBe(400)
      expect((await DELETE(json('DELETE', 'garbage'))).status).toBe(400)
    })

    it('answers 503 when there is no store', async () => {
      getFollowStore.mockImplementation(() => {
        throw new Error('production has no database')
      })
      const res = await DELETE(json('DELETE', { endpoint: SUB.endpoint, beachId: 'hrm-chocolate-lake' }))
      expect(res.status).toBe(503)
    })
  })
})
