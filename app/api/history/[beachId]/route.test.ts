import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FixtureStore } from '@/lib/db/fixture-store'
import { MemoryStore, type PageStore } from '@/lib/db/store'
import type { BeachHistory } from '@/lib/history'

/**
 * The history route against the fixture store (the seeded year) and a memory
 * store: the spans it folds, the beach it refuses, and the store it lacks.
 * `getStore` is the only thing replaced.
 */
let store: PageStore | (() => never) = new FixtureStore()
vi.mock('@/lib/db/client', () => ({ getStore: () => (typeof store === 'function' ? store() : store) }))

const { GET } = await import('./route')

const get = (beachId: string) =>
  GET(new Request(`http://localhost/api/history/${beachId}`), { params: Promise.resolve({ beachId }) })

describe('/api/history/:beachId', () => {
  beforeEach(() => {
    store = new FixtureStore()
  })

  it('answers the seeded year of one beach as spans, oldest first, with cache headers', async () => {
    const res = await get('hrm-oakfield-park')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=300, stale-while-revalidate=3600')
    const body = (await res.json()) as BeachHistory
    expect(body.beachId).toBe('hrm-oakfield-park')
    expect(body.from).toBe('2026-01-01')
    expect(body.to).toBe('2026-09-12')
    // Off-season to June 30, open, then the closure notice, the closed weeks, the reopening, the rest of the season, off-season.
    expect(body.spans.map((s) => [s.from, s.to, s.state, s.basis])).toEqual([
      ['2026-01-01', '2026-06-30', 'offseason', 'calendar'],
      ['2026-07-01', '2026-07-01', 'open', 'verified'],
      ['2026-07-02', '2026-07-23', 'open', 'inferred'],
      ['2026-07-24', '2026-07-24', 'open', 'verified'],
      ['2026-07-25', '2026-07-27', 'open', 'inferred'],
      ['2026-07-28', '2026-07-28', 'closed', 'verified'],
      ['2026-07-29', '2026-08-23', 'closed', 'inferred'],
      ['2026-08-24', '2026-08-24', 'open', 'verified'],
      ['2026-08-25', '2026-08-31', 'open', 'inferred'],
      ['2026-09-01', '2026-09-12', 'offseason', 'calendar'],
    ])
    expect(body.spans[5].note).toContain('Oakfield Beach closed to swimming')
  })

  it('answers an empty history for a roster beach with no rows yet', async () => {
    store = new MemoryStore()
    const res = await get('ns-rissers')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ beachId: 'ns-rissers', from: '', to: '', spans: [] })
  })

  it('404s a beach not on the roster', async () => {
    const res = await get('not-a-beach')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'beachId is not a monitored beach' })
  })

  it('503s when there is no store to read', async () => {
    store = () => {
      throw new Error('production has no database')
    }
    const res = await get('hrm-kinap')
    expect(res.status).toBe(503)
  })

  it('500s with the message when the store fails', async () => {
    const failing = new MemoryStore()
    failing.beachHistory = async () => {
      throw new Error('supabase status_day by beach: gateway timeout')
    }
    store = failing
    const res = await get('hrm-kinap')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'supabase status_day by beach: gateway timeout' })
  })
})
