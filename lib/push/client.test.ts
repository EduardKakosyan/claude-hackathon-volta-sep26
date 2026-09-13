import { describe, expect, it, vi } from 'vitest'

import { createFollowClient, FOLLOW_ENDPOINT } from './client'

const SUB = { endpoint: 'https://push.example.org/one', keys: { p256dh: 'p', auth: 'a' } }

describe('createFollowClient', () => {
  it('follow posts the subscription and beach as JSON and resolves on 204', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    await createFollowClient(fetchImpl as unknown as typeof fetch).follow(SUB, 'hrm-chocolate-lake')
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(FOLLOW_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({ subscription: SUB, beachId: 'hrm-chocolate-lake' })
  })

  it('unfollow sends DELETE with the endpoint and beach', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    await createFollowClient(fetchImpl as unknown as typeof fetch).unfollow(SUB.endpoint, 'ns-rissers')
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ endpoint: SUB.endpoint, beachId: 'ns-rissers' })
  })

  it('anything but 204 rejects with the status and the server\'s reason when it gave one', async () => {
    const refused = vi.fn(async () => Response.json({ error: 'database not configured' }, { status: 503 }))
    await expect(createFollowClient(refused as unknown as typeof fetch).follow(SUB, 'x')).rejects.toThrow(
      'follow: POST answered 503 — database not configured',
    )
    const bare = vi.fn(async () => new Response('gateway timeout', { status: 504 }))
    await expect(createFollowClient(bare as unknown as typeof fetch).unfollow(SUB.endpoint, 'x')).rejects.toThrow('follow: DELETE answered 504')
  })
})
