import { describe, expect, it, vi } from 'vitest'

import { MemoryStore } from '@/lib/db/store'
import { activeSources, refreshLive, type SourceFetcher } from '@/lib/ingest/refresh-live'
import type { ParseResult } from '@/lib/ingest/types'
import { BEACHES } from '@/lib/seed/beaches'

const ok = (result: ParseResult): SourceFetcher => ({
  fetch: async () => 'raw',
  parse: () => result,
})

const failing = (message: string): SourceFetcher => ({
  fetch: async () => {
    throw new Error(message)
  },
  parse: () => ({ readings: [], anomalies: [] }),
})

/** A fetcher that must never be called: out of season the network is not touched. */
const forbidden = (source: string): SourceFetcher => ({
  fetch: vi.fn(async () => {
    throw new Error(`${source} was fetched out of season`)
  }),
  parse: () => ({ readings: [], anomalies: [] }),
})

const empty = () => ok({ readings: [], anomalies: [] })

/** Mid-August: both authorities in season. */
const NOW = () => new Date('2026-08-14T12:00:00.000Z')
/** Mid-September: both out. */
const SEPTEMBER = () => new Date('2026-09-12T11:02:00.000Z')
/** June 28: HRM in, province not yet. */
const LATE_JUNE = () => new Date('2026-06-28T12:00:00.000Z')

describe('activeSources', () => {
  it('reads all three in season, nothing out of season', () => {
    expect(activeSources('2026-08-14')).toEqual(['hrm', 'parks', 'algae'])
    expect(activeSources('2026-09-12')).toEqual([])
  })

  it('reads HRM and the algae feed, not the parks advisories, when only HRM is in season', () => {
    expect(activeSources('2026-06-28')).toEqual(['hrm', 'algae'])
    expect(activeSources('2026-08-31')).toEqual(['hrm', 'algae'])
  })
})

describe('refreshLive', () => {
  it('writes live status and status_day rows for readings from ok sources', async () => {
    const writer = new MemoryStore()
    const result = await refreshLive({
      writer,
      now: NOW,
      fetchers: {
        hrm: ok({
          readings: [{ beachId: 'hrm-albro-lake', source: 'hrm', kind: 'offseason', verbatim: 'x', url: 'u' }],
          anomalies: [],
        }),
        parks: empty(),
        algae: empty(),
      },
    })

    expect(result.sources.every((s) => s.ok)).toBe(true)
    expect(result.offseason).toEqual([])
    const live = await writer.liveStatus()
    expect(live.find((r) => r.beachId === 'hrm-albro-lake')?.state).toBe('offseason')
    const days = await writer.dayStatus('2026-08-14')
    expect(days.find((r) => r.beachId === 'hrm-albro-lake')).toMatchObject({ state: 'offseason', basis: 'scraped', note: null })
  })

  it('keeps prior lastSuccessAt and records lastError when a source fails', async () => {
    const writer = new MemoryStore()
    await writer.upsertSourceHealth([
      { source: 'hrm', lastAttemptAt: '2026-08-13T12:00:00.000Z', lastSuccessAt: '2026-08-13T12:00:00.000Z', lastError: null },
    ])

    await refreshLive({
      writer,
      now: NOW,
      fetchers: {
        hrm: failing('boom'),
        parks: empty(),
        algae: empty(),
      },
    })

    const health = await writer.health()
    const hrmHealth = health.find((h) => h.source === 'hrm')
    expect(hrmHealth?.lastSuccessAt).toBe('2026-08-13T12:00:00.000Z')
    expect(hrmHealth?.lastAttemptAt).toBe('2026-08-14T12:00:00.000Z')
    expect(hrmHealth?.lastError).toContain('boom')
  })

  it('a failed source leaves prior beach rows untouched (no reading applied)', async () => {
    const writer = new MemoryStore()
    await writer.upsertLiveStatus([
      {
        kind: 'live',
        beachId: 'hrm-albro-lake',
        state: 'open',
        source: 'hrm',
        verbatim: 'Open',
        sourceUrl: 'u',
        postedAt: null,
        confirmedAt: '2026-08-13T12:00:00.000Z',
      },
    ])

    await refreshLive({
      writer,
      now: NOW,
      fetchers: {
        hrm: failing('boom'),
        parks: empty(),
        algae: empty(),
      },
    })

    const live = await writer.liveStatus()
    expect(live.find((r) => r.beachId === 'hrm-albro-lake')?.state).toBe('open')
    expect(live.find((r) => r.beachId === 'hrm-albro-lake')?.confirmedAt).toBe('2026-08-13T12:00:00.000Z')
  })

  describe('out of season', () => {
    it('makes no fetch call and writes every beach as offseason from source season', async () => {
      const writer = new MemoryStore()
      const fetchers = { hrm: forbidden('hrm'), parks: forbidden('parks'), algae: forbidden('algae') }
      const result = await refreshLive({ writer, now: SEPTEMBER, fetchers })

      for (const f of Object.values(fetchers)) expect(f.fetch).not.toHaveBeenCalled()
      expect(result.sources).toEqual([])
      expect(result.offseason).toEqual(['hrm', 'province'])
      expect(result.written).toBe(BEACHES.length)
      expect(result.omitted).toBe(0)

      const live = await writer.liveStatus()
      expect(live).toHaveLength(BEACHES.length)
      for (const row of live) {
        const beach = BEACHES.find((b) => b.id === row.beachId)!
        expect(row).toEqual({
          kind: 'live',
          beachId: beach.id,
          state: 'offseason',
          source: 'season',
          verbatim: 'Off-season',
          sourceUrl: beach.sourceUrl,
          postedAt: null,
          confirmedAt: '2026-09-12T11:02:00.000Z',
        })
      }
      const days = await writer.dayStatus('2026-09-12')
      expect(days).toHaveLength(BEACHES.length)
      expect(days.every((r) => r.state === 'offseason' && r.basis === 'scraped')).toBe(true)
    })

    it('records no attempt for a skipped source, so its health keeps the last in-season read', async () => {
      const writer = new MemoryStore()
      const august = { lastAttemptAt: '2026-08-31T20:02:00.000Z', lastSuccessAt: '2026-08-31T20:02:00.000Z', lastError: null }
      await writer.upsertSourceHealth([
        { source: 'hrm', ...august },
        { source: 'parks', ...august },
        { source: 'algae', ...august },
      ])

      await refreshLive({ writer, now: SEPTEMBER, fetchers: { hrm: forbidden('hrm'), parks: forbidden('parks'), algae: forbidden('algae') } })

      const health = await writer.health()
      expect(health).toHaveLength(3)
      for (const h of health) expect(h).toMatchObject(august)
    })

    it('the calendar overwrites a stale in-season row: yesterday\'s Open never reads as today\'s', async () => {
      const writer = new MemoryStore()
      await writer.upsertLiveStatus([
        {
          kind: 'live',
          beachId: 'hrm-chocolate-lake',
          state: 'open',
          source: 'hrm',
          verbatim: 'Open',
          sourceUrl: 'u',
          postedAt: null,
          confirmedAt: '2026-08-31T20:02:00.000Z',
        },
      ])

      await refreshLive({ writer, now: SEPTEMBER, fetchers: { hrm: forbidden('hrm'), parks: forbidden('parks'), algae: forbidden('algae') } })

      const row = (await writer.liveStatus()).find((r) => r.beachId === 'hrm-chocolate-lake')
      expect(row).toMatchObject({ state: 'offseason', source: 'season', confirmedAt: '2026-09-12T11:02:00.000Z' })
    })
  })

  describe('one authority in season', () => {
    it('reads HRM and the algae feed only; provincial beaches are written as offseason, HRM beaches from the table', async () => {
      const writer = new MemoryStore()
      const parks = forbidden('parks')
      const result = await refreshLive({
        writer,
        now: LATE_JUNE,
        fetchers: {
          hrm: ok({
            readings: [{ beachId: 'hrm-chocolate-lake', source: 'hrm', kind: 'open', verbatim: 'Open', url: 'u' }],
            anomalies: [],
          }),
          parks,
          algae: ok({
            readings: [
              { beachId: 'hrm-oakfield-park', source: 'algae', kind: 'closed', verbatim: 'Grand Lake — Bloom', url: 'a', observedOn: '2026-06-25' },
            ],
            anomalies: [],
          }),
        },
      })

      expect(parks.fetch).not.toHaveBeenCalled()
      expect(result.sources.map((s) => s.source).sort()).toEqual(['algae', 'hrm'])
      expect(result.offseason).toEqual(['province'])

      const live = new Map((await writer.liveStatus()).map((r) => [r.beachId, r]))
      expect(live.get('hrm-chocolate-lake')).toMatchObject({ state: 'open', source: 'hrm' })
      // The algae feed still closes an HRM lake before the province opens.
      expect(live.get('hrm-oakfield-park')).toMatchObject({ state: 'closed', source: 'algae' })
      expect(live.get('ns-rissers')).toMatchObject({ state: 'offseason', source: 'season', verbatim: 'Off-season' })
      // An HRM beach missing from the table stays omitted: honesty rules are unchanged in season.
      expect(live.has('hrm-albro-lake')).toBe(false)
      const provincial = BEACHES.filter((b) => b.authority === 'province')
      expect(provincial.every((b) => live.get(b.id)?.source === 'season')).toBe(true)
      expect(result.omitted).toBe(BEACHES.filter((b) => b.authority === 'hrm').length - 2)
    })
  })
})
