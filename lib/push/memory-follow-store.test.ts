import { describe, expect, it } from 'vitest'

import { isHttpsUrl, parseSubscription } from './follow-store'
import { MemoryFollowStore } from './memory-follow-store'

const A = { endpoint: 'https://push.example.org/a', keys: { p256dh: 'pa', auth: 'aa' } }
const B = { endpoint: 'https://push.example.org/b', keys: { p256dh: 'pb', auth: 'ab' } }

describe('MemoryFollowStore', () => {
  it('a subscription follows several beaches; followersOf returns one entry per pair asked for', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(A, 'hrm-chocolate-lake')
    await store.subscribe(A, 'ns-rissers')
    await store.subscribe(B, 'ns-rissers')

    expect(await store.followersOf(['ns-rissers'])).toEqual([
      { ...A, beachId: 'ns-rissers' },
      { ...B, beachId: 'ns-rissers' },
    ])
    expect(await store.followersOf(['hrm-chocolate-lake', 'ns-rissers'])).toHaveLength(3)
    expect(await store.followersOf(['hrm-albro-lake'])).toEqual([])
    expect(await store.followersOf([])).toEqual([])
  })

  it('subscribing again with new keys replaces the keys, not the follows', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(A, 'hrm-chocolate-lake')
    await store.subscribe({ ...A, keys: { p256dh: 'new', auth: 'new' } }, 'ns-rissers')

    const followers = await store.followersOf(['hrm-chocolate-lake', 'ns-rissers'])
    expect(followers).toHaveLength(2)
    expect(followers.every((f) => f.keys.p256dh === 'new')).toBe(true)
  })

  it('the last unfollow removes the subscription; an unknown unfollow is a no-op', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(A, 'hrm-chocolate-lake')
    await store.subscribe(A, 'ns-rissers')

    await store.unsubscribe(A.endpoint, 'hrm-chocolate-lake')
    expect(store.subscriptions.has(A.endpoint)).toBe(true)
    await store.unsubscribe(A.endpoint, 'ns-rissers')
    expect(store.subscriptions.has(A.endpoint)).toBe(false)
    expect(store.follows.has(A.endpoint)).toBe(false)

    await expect(store.unsubscribe(B.endpoint, 'ns-rissers')).resolves.toBeUndefined()
  })

  it('remove drops the subscription and every follow it had', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(A, 'hrm-chocolate-lake')
    await store.subscribe(A, 'ns-rissers')
    await store.subscribe(B, 'ns-rissers')

    await store.remove(A.endpoint)
    expect(await store.followersOf(['hrm-chocolate-lake', 'ns-rissers'])).toEqual([{ ...B, beachId: 'ns-rissers' }])
  })

  it('hands out copies: a caller mutating a follower does not touch the store', async () => {
    const store = new MemoryFollowStore()
    await store.subscribe(A, 'ns-rissers')
    const [follower] = await store.followersOf(['ns-rissers'])
    follower.keys.auth = 'tampered'
    expect((await store.followersOf(['ns-rissers']))[0].keys.auth).toBe('aa')
  })
})

describe('parseSubscription', () => {
  it('accepts what PushSubscription.toJSON() yields and drops expirationTime', () => {
    expect(parseSubscription({ ...A, expirationTime: null })).toEqual(A)
  })

  it('refuses anything without an https endpoint and two non-empty keys', () => {
    expect(parseSubscription(null)).toBeNull()
    expect(parseSubscription('https://push.example.org/a')).toBeNull()
    expect(parseSubscription({ endpoint: 'http://push.example.org/a', keys: A.keys })).toBeNull()
    expect(parseSubscription({ endpoint: A.endpoint })).toBeNull()
    expect(parseSubscription({ endpoint: A.endpoint, keys: { p256dh: 'p' } })).toBeNull()
    expect(parseSubscription({ endpoint: A.endpoint, keys: { p256dh: 'p', auth: '' } })).toBeNull()
  })

  it('isHttpsUrl', () => {
    expect(isHttpsUrl('https://fcm.googleapis.com/fcm/send/x')).toBe(true)
    expect(isHttpsUrl('http://localhost/x')).toBe(false)
    expect(isHttpsUrl('')).toBe(false)
  })
})
