import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MemoryStore } from '@/lib/db/store'
import { MemoryFollowStore } from '@/lib/push/memory-follow-store'

/**
 * The route's four stages, with the ingest and send functions replaced: what
 * matters here is the bearer check, the no-database answer, and that a
 * conditions or push failure — thrown or reported — never costs the status
 * write its 200.
 */
const writer = new MemoryStore()
const followStore = new MemoryFollowStore()
const getWriter = vi.fn<() => MemoryStore | null>(() => writer)
const refreshLive = vi.fn()
const refreshConditions = vi.fn()
const sendTransitions = vi.fn()
const sender = { send: vi.fn() }
const vapid = { subject: 'mailto:dev@localhost', publicKey: 'pub', privateKey: 'priv' }

vi.mock('@/lib/db/client', () => ({ getWriter: () => getWriter(), getFollowStore: () => followStore }))
vi.mock('@/lib/ingest/refresh-live', () => ({ refreshLive: (...args: unknown[]) => refreshLive(...args) }))
vi.mock('@/lib/ingest/refresh-conditions', () => ({
  refreshConditions: (...args: unknown[]) => refreshConditions(...args),
}))
vi.mock('@/lib/push/send', () => ({ sendTransitions: (...args: unknown[]) => sendTransitions(...args) }))
vi.mock('@/lib/push/server', () => ({
  resolveVapid: () => vapid,
  createWebPushSender: (v: unknown) => (v ? sender : null),
}))

const { GET } = await import('./route')

const request = (auth?: string) =>
  new Request('http://localhost/api/refresh', { headers: auth ? { authorization: auth } : {} })

describe('GET /api/refresh', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'shh'
    getWriter.mockReturnValue(writer)
    refreshLive.mockResolvedValue({ attemptedAt: 'x', today: '2026-09-13', sources: [], written: 0, omitted: 0, transitions: [] })
    refreshConditions.mockResolvedValue({ attemptedAt: 'x', sources: [{ source: 'wind', ok: true, error: null }], written: { conditions: 35, buoy: true } })
    sendTransitions.mockResolvedValue({ sent: 0, removed: 0, failed: 0 })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    refreshLive.mockReset()
    refreshConditions.mockReset()
    sendTransitions.mockReset()
  })

  it('answers 401 without the cron secret, and when the secret is unset', async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request('Bearer nope'))).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await GET(request('Bearer shh'))).status).toBe(401)
    expect(refreshLive).not.toHaveBeenCalled()
  })

  it('answers 503 when there is no database to write to', async () => {
    getWriter.mockReturnValue(null)
    const res = await GET(request('Bearer shh'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'database not configured' })
  })

  it('runs seed, live, conditions, then push, and reports all four', async () => {
    const transitions = [{ beachId: 'hrm-chocolate-lake', from: 'open', to: 'advisory', status: {} }]
    refreshLive.mockResolvedValue({ attemptedAt: 'x', today: '2026-09-13', sources: [], written: 35, omitted: 0, transitions })
    sendTransitions.mockResolvedValue({ sent: 2, removed: 1, failed: 0 })

    const res = await GET(request('Bearer shh'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.seeded.beaches).toBe(35)
    expect(body.live.today).toBe('2026-09-13')
    expect(body.live.transitions).toEqual(transitions)
    expect(body.conditions.sources).toEqual([{ source: 'wind', ok: true, error: null }])
    expect(body.pushed).toEqual({ sent: 2, removed: 1, failed: 0 })
    expect(refreshLive).toHaveBeenCalledWith(expect.objectContaining({ writer }))
    expect(refreshConditions).toHaveBeenCalledWith(expect.objectContaining({ writer }))
    // The push stage gets the live stage's diff, the follow store, and a sender signed with the resolved keys.
    expect(sendTransitions).toHaveBeenCalledWith(expect.objectContaining({ transitions, store: followStore, sender }))
  })

  it('a push stage that throws still returns 200 with everything before it, and the error beside', async () => {
    sendTransitions.mockRejectedValue(new Error('supabase follow select: down'))
    const res = await GET(request('Bearer shh'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.live.today).toBe('2026-09-13')
    expect(body.conditions.sources).toHaveLength(1)
    expect(body.pushed).toEqual({ error: 'supabase follow select: down' })
  })

  it('a conditions stage that throws still returns 200 with the status result and the error beside it', async () => {
    refreshConditions.mockRejectedValue(new Error('open-meteo exploded'))
    const res = await GET(request('Bearer shh'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.live.today).toBe('2026-09-13')
    expect(body.conditions).toEqual({ error: 'open-meteo exploded' })
  })

  it('a live stage that throws is still a 500, logged, and conditions never run after it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    refreshLive.mockRejectedValue(new Error('supabase beach_status upsert: down'))
    const res = await GET(request('Bearer shh'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'supabase beach_status upsert: down' })
    expect(error).toHaveBeenCalledWith(expect.stringContaining('supabase beach_status upsert: down'))
    expect(refreshConditions).not.toHaveBeenCalled()
    expect(sendTransitions).not.toHaveBeenCalled()
  })
})
