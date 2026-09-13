import { describe, expect, it } from 'vitest'

import { FIXTURE_CHECKED_AT, FIXTURE_OFFSEASON_CHECKED_AT, FIXTURE_OMITTED, FIXTURE_TODAY } from '@/lib/fixture/today'
import { BEACHES, BEACHES_BY_ID } from '@/lib/seed/beaches'

import { FixtureStore } from './fixture-store'

describe('FixtureStore', () => {
  const store = new FixtureStore()

  it('is the fixture kind, so the footer can say so', () => {
    expect(store.kind).toBe('fixture')
  })

  it('serves one live row for every roster beach except the omitted ones', async () => {
    const rows = await store.liveStatus()
    const ids = rows.map((r) => r.beachId)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length + FIXTURE_OMITTED.length).toBe(BEACHES.length)
    for (const id of ids) expect(BEACHES_BY_ID[id]).toBeDefined()
    for (const id of FIXTURE_OMITTED) {
      expect(BEACHES_BY_ID[id]).toBeDefined()
      expect(ids).not.toContain(id)
    }
    expect(FIXTURE_OMITTED.length).toBe(2)
  })

  it('spreads the four states across the day', async () => {
    const rows = await store.liveStatus()
    const byState = (state: string) => rows.filter((r) => r.state === state).length

    expect(byState('open')).toBeGreaterThan(0)
    expect(byState('advisory')).toBeGreaterThan(0)
    expect(byState('closed')).toBeGreaterThan(0)
    expect(byState('offseason')).toBeGreaterThan(0)
    // The spread is the point: a fixture that is mostly one colour proves nothing.
    expect(byState('open')).toBeLessThan(rows.length)
  })

  it('shapes every row like the resolver would', async () => {
    for (const row of await store.liveStatus()) {
      const beach = BEACHES_BY_ID[row.beachId]
      expect(row.kind).toBe('live')
      expect(row.confirmedAt).toBe(FIXTURE_CHECKED_AT)
      expect(row.sourceUrl).toMatch(/^https:\/\//)
      if (row.source === 'hrm') expect(beach.authority).toBe('hrm')
      if (row.source === 'parks' || row.source === 'season') expect(beach.authority).toBe('province')
      if (row.source === 'season') {
        expect(row.state).toBe('open')
        expect(row.sourceUrl).toBe(beach.sourceUrl)
      }
      if (row.source === 'algae') expect(row.state).toBe('closed')
    }
  })

  it('reports all five sources as healthy at the fixture time', async () => {
    const health = await store.health()
    expect(health.map((h) => h.source).sort()).toEqual(['algae', 'buoy', 'hrm', 'parks', 'wind'])
    for (const h of health) {
      expect(h.lastAttemptAt).toBe(FIXTURE_CHECKED_AT)
      expect(h.lastSuccessAt).toBe(FIXTURE_CHECKED_AT)
      expect(h.lastError).toBeNull()
    }
  })

  it('keeps the seeded replay days', async () => {
    expect(await store.days()).toEqual(['2026-08-14'])
    expect(await store.dayStatus('2026-08-14')).toHaveLength(35)
    expect(await store.dayStatus('2026-07-01')).toEqual([])
    expect(await store.history('2026-08-01', '2026-08-14')).toHaveLength(35)
    expect(await store.history('2026-08-15', '2026-08-28')).toEqual([])
  })

  it('serves a wind row for every beach and one buoy reading, both stamped just before the clock', async () => {
    const clocked = new FixtureStore(() => new Date('2026-09-12T15:07:00Z'))
    const rows = await clocked.conditions()
    expect(rows).toHaveLength(BEACHES.length)
    expect(new Set(rows.map((r) => r.beachId)).size).toBe(BEACHES.length)
    for (const row of rows) {
      expect(row.observedAt).toBe('2026-09-12T15:00:00.000Z')
      expect(row.windKmh).toBeGreaterThan(0)
      expect(row.windDirDeg).toBeGreaterThanOrEqual(0)
    }
    expect(await clocked.buoy()).toEqual({
      buoy: 'smartatlantic-halifax',
      waterTempC: 16.4,
      observedAt: '2026-09-12T14:30:00.000Z',
    })
  })

  it('hands out copies, never the module constants', async () => {
    const rows = await store.liveStatus()
    rows.length = 0
    expect(FIXTURE_TODAY.length).toBeGreaterThan(0)
    expect(await store.liveStatus()).toHaveLength(FIXTURE_TODAY.length)
  })

  describe('the off-season variant', () => {
    const clock = () => new Date('2026-09-12T15:07:00Z')
    const off = new FixtureStore(clock).fixtureVariant('offseason')

    it('is still the fixture kind, and leaves the store it came from on the in-season day', async () => {
      expect(off.kind).toBe('fixture')
      expect((await new FixtureStore(clock).liveStatus()).some((r) => r.state !== 'offseason')).toBe(true)
    })

    it('serves every beach as offseason from source season, exactly as the refresh writes it', async () => {
      const rows = await off.liveStatus()
      expect(rows).toHaveLength(BEACHES.length)
      expect(new Set(rows.map((r) => r.beachId)).size).toBe(BEACHES.length)
      for (const row of rows) {
        expect(row).toMatchObject({
          kind: 'live',
          state: 'offseason',
          source: 'season',
          verbatim: 'Off-season',
          sourceUrl: BEACHES_BY_ID[row.beachId].sourceUrl,
          postedAt: null,
          confirmedAt: FIXTURE_OFFSEASON_CHECKED_AT,
        })
      }
    })

    it('reports the conditions feeds as current and the status sources as last read in season', async () => {
      const health = new Map((await off.health()).map((h) => [h.source, h]))
      expect([...health.keys()].sort()).toEqual(['algae', 'buoy', 'hrm', 'parks', 'wind'])
      for (const source of ['wind', 'buoy'] as const) {
        expect(health.get(source)).toMatchObject({ lastAttemptAt: FIXTURE_OFFSEASON_CHECKED_AT, lastSuccessAt: FIXTURE_OFFSEASON_CHECKED_AT, lastError: null })
      }
      for (const source of ['hrm', 'parks', 'algae'] as const) {
        const h = health.get(source)!
        expect(h.lastError).toBeNull()
        expect(h.lastSuccessAt).toBe(h.lastAttemptAt)
        expect(h.lastAttemptAt < FIXTURE_OFFSEASON_CHECKED_AT).toBe(true)
      }
    })

    it('keeps the conditions, the buoy and the replay days of the in-season store', async () => {
      expect(await off.conditions()).toEqual(await new FixtureStore(clock).conditions())
      expect(await off.buoy()).toEqual(await new FixtureStore(clock).buoy())
      expect(await off.days()).toEqual(['2026-08-14'])
    })
  })
})
