import { describe, expect, it } from 'vitest'

import { FIXTURE_OMITTED } from '@/lib/fixture/today'
import { BEACHES } from '@/lib/seed/beaches'
import { seedRefresh } from '@/lib/ingest/refresh'

import { FixtureStore } from './fixture-store'
import { loadPage } from './queries'
import { MemoryStore } from './store'

const NOW = new Date('2026-09-12T15:00:00Z')

describe('loadPage', () => {
  it('serves the seeded day from git with no database', async () => {
    const data = await loadPage({ params: { day: '2026-08-14' }, store: new FixtureStore(), now: NOW })
    expect(data.storeKind).toBe('fixture')
    expect(data.replayDay).toBe('2026-08-14')
    expect(Object.keys(data.status)).toHaveLength(35)
    expect(data.status['ns-rainbow-haven']).toMatchObject({ kind: 'replay', state: 'advisory' })
    expect(data.days).toEqual(['2026-08-14'])
    expect(data.historyTo).toBe('2026-08-14')
    expect(data.historyFrom).toBe('2026-08-01')
    expect(data.history['hrm-kinap']?.map((r) => r.day)).toEqual(['2026-08-14'])
  })

  it('fixture mode: live rows for every beach but the omitted two, and three healthy sources', async () => {
    const data = await loadPage({ params: {}, store: new FixtureStore(), now: NOW })
    expect(data.storeKind).toBe('fixture')
    expect(data.replayDay).toBeUndefined()
    expect(Object.keys(data.status)).toHaveLength(BEACHES.length - FIXTURE_OMITTED.length)
    for (const id of FIXTURE_OMITTED) expect(data.status[id]).toBeUndefined()
    expect(data.status['hrm-chocolate-lake']).toMatchObject({ kind: 'live', state: 'open', source: 'hrm' })
    expect(data.status['ns-rainbow-haven']).toMatchObject({ kind: 'live', state: 'advisory', source: 'parks' })
    expect(data.health.map((h) => h.source).sort()).toEqual(['algae', 'buoy', 'hrm', 'parks', 'wind'])
    expect(data.health.every((h) => h.lastError === null)).toBe(true)
    expect(data.historyTo).toBe('2026-09-12')
  })

  it('fixture mode: every beach carries wind stamped at the clock; only the nine salt beaches near the buoy carry water', async () => {
    const data = await loadPage({ params: {}, store: new FixtureStore(() => NOW), now: NOW })
    expect(Object.keys(data.conditions)).toHaveLength(BEACHES.length)
    const withWater = Object.entries(data.conditions)
      .filter(([, c]) => c?.waterTempC !== undefined)
      .map(([id]) => id)
      .sort()
    expect(withWater).toEqual([
      'hrm-kinap',
      'hrm-taylor-head',
      'ns-bayswater',
      'ns-clam-harbour',
      'ns-lawrencetown',
      'ns-martinique',
      'ns-queensland',
      'ns-rainbow-haven',
      'ns-rissers',
    ])
    expect(data.conditions['hrm-chocolate-lake']).toMatchObject({ windKmh: 19, windDir: 'SW', observedAt: '2026-09-12T15:00:00.000Z' })
    expect(data.conditions['hrm-chocolate-lake']?.waterTempC).toBeUndefined()
    expect(data.conditions['ns-rainbow-haven']?.waterTempC).toBe(16.4)
    expect(data.conditions['ns-rainbow-haven']?.sunrise).toMatch(/^2026-09-12T/)
  })

  it('a replay day carries no conditions: yesterday\'s status never wears today\'s wind', async () => {
    const data = await loadPage({ params: { day: '2026-08-14' }, store: new FixtureStore(() => NOW), now: NOW })
    expect(data.conditions).toEqual({})
  })

  it('drops a malformed day and an unknown beach', async () => {
    const data = await loadPage({
      params: { day: 'august', beach: 'nope' },
      store: new FixtureStore(),
      now: NOW,
    })
    expect(data.replayDay).toBeUndefined()
    expect(data.initialBeachId).toBeUndefined()
  })

  it('keeps a known beach and a replay day together', async () => {
    const data = await loadPage({
      params: { day: '2026-08-14', beach: 'hrm-oakfield-park' },
      store: new FixtureStore(),
      now: NOW,
    })
    expect(data.initialBeachId).toBe('hrm-oakfield-park')
    expect(data.status['hrm-oakfield-park']).toMatchObject({ state: 'closed', basis: 'inferred' })
  })

  it('replays a day that was never recorded as all unknown, still labelled', async () => {
    const data = await loadPage({ params: { day: '2026-07-01' }, store: new FixtureStore(), now: NOW })
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

  it('drops stale wind rows, keeps fresh ones, and joins the buoy only to salt beaches within 100 km', async () => {
    const store = new MemoryStore()
    const fresh = '2026-09-12T14:30:00Z' // 30 min before NOW
    const stale = '2026-09-12T11:30:00Z' // 3 h 30 min before NOW
    await store.upsertConditions([
      { beachId: 'ns-rainbow-haven', windKmh: 25.3, windDirDeg: 225, airTempC: 18, observedAt: fresh },
      { beachId: 'ns-melmerby', windKmh: 30, windDirDeg: 315, airTempC: 20, observedAt: fresh },
      { beachId: 'hrm-chocolate-lake', windKmh: 12, windDirDeg: 90, airTempC: null, observedAt: fresh },
      { beachId: 'hrm-birch-cove', windKmh: 40, windDirDeg: 0, airTempC: 15, observedAt: stale },
      { beachId: 'not-a-beach', windKmh: 1, windDirDeg: 0, airTempC: null, observedAt: fresh },
    ])
    await store.upsertBuoy({ buoy: 'smartatlantic-halifax', waterTempC: 15.6, observedAt: '2026-09-12T12:23:01Z' })

    const { conditions } = await loadPage({ params: {}, store, now: NOW })
    expect(Object.keys(conditions).sort()).toEqual(['hrm-chocolate-lake', 'ns-melmerby', 'ns-rainbow-haven'])
    expect(conditions['ns-rainbow-haven']).toMatchObject({ windKmh: 25.3, windDir: 'SW', airTempC: 18, waterTempC: 15.6, waterObservedAt: '2026-09-12T12:23:01Z' })
    expect(conditions['ns-melmerby']?.waterTempC).toBeUndefined() // salt, but 147 km from the buoy
    expect(conditions['hrm-chocolate-lake']?.waterTempC).toBeUndefined() // a lake
    expect(conditions['hrm-chocolate-lake']?.airTempC).toBeUndefined()
    expect(conditions['hrm-birch-cove']).toBeUndefined() // stale
  })
})
