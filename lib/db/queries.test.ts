import { describe, expect, it } from 'vitest'

import { BEACHES } from '@/lib/seed/beaches'
import { seedRefresh } from '@/lib/ingest/refresh'

import { loadPage } from './queries'
import { MemoryStore, SeedStore } from './store'

const NOW = new Date('2026-09-12T15:00:00Z')

describe('loadPage', () => {
  it('serves the seeded day from git with no database', async () => {
    const data = await loadPage({ params: { day: '2026-08-14' }, store: new SeedStore(), now: NOW })
    expect(data.storeKind).toBe('seed')
    expect(data.replayDay).toBe('2026-08-14')
    expect(Object.keys(data.status)).toHaveLength(35)
    expect(data.status['ns-rainbow-haven']).toMatchObject({ kind: 'replay', state: 'advisory' })
    expect(data.days).toEqual(['2026-08-14'])
    expect(data.historyTo).toBe('2026-08-14')
    expect(data.historyFrom).toBe('2026-08-01')
    expect(data.history['hrm-kinap']?.map((r) => r.day)).toEqual(['2026-08-14'])
  })

  it('renders live with nothing read yet: every pin unknown', async () => {
    const data = await loadPage({ params: {}, store: new SeedStore(), now: NOW })
    expect(data.replayDay).toBeUndefined()
    expect(data.status).toEqual({})
    expect(data.health).toEqual([])
    expect(data.historyTo).toBe('2026-09-12')
  })

  it('drops a malformed day and an unknown beach', async () => {
    const data = await loadPage({
      params: { day: 'august', beach: 'nope' },
      store: new SeedStore(),
      now: NOW,
    })
    expect(data.replayDay).toBeUndefined()
    expect(data.initialBeachId).toBeUndefined()
  })

  it('keeps a known beach and a replay day together', async () => {
    const data = await loadPage({
      params: { day: '2026-08-14', beach: 'hrm-oakfield-park' },
      store: new SeedStore(),
      now: NOW,
    })
    expect(data.initialBeachId).toBe('hrm-oakfield-park')
    expect(data.status['hrm-oakfield-park']).toMatchObject({ state: 'closed', basis: 'inferred' })
  })

  it('replays a day that was never recorded as all unknown, still labelled', async () => {
    const data = await loadPage({ params: { day: '2026-07-01' }, store: new SeedStore(), now: NOW })
    expect(data.replayDay).toBe('2026-07-01')
    expect(data.status).toEqual({})
  })

  it('reads live rows written through the writer port', async () => {
    const store = new MemoryStore()
    await seedRefresh(store)
    await store.upsertLiveStatus([
      {
        kind: 'live',
        beachId: 'ns-rainbow-haven',
        state: 'closed',
        source: 'parks',
        verbatim: 'Rainbow Haven Beach Closed for Construction',
        sourceUrl: 'https://parks.novascotia.ca/advisories',
        postedAt: null,
        confirmedAt: '2026-09-12T14:00:00Z',
      },
    ])
    const data = await loadPage({ params: {}, store, now: NOW })
    expect(data.status['ns-rainbow-haven']).toMatchObject({ kind: 'live', source: 'parks' })
    expect(store.beaches.size).toBe(BEACHES.length)
  })
})
