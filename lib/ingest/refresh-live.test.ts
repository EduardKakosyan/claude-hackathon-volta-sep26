import { describe, expect, it } from 'vitest'

import { MemoryStore } from '@/lib/db/store'
import { refreshLive, type SourceFetcher } from '@/lib/ingest/refresh-live'
import type { ParseResult } from '@/lib/ingest/types'

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

const NOW = () => new Date('2026-08-14T12:00:00.000Z')

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
        parks: ok({ readings: [], anomalies: [] }),
        algae: ok({ readings: [], anomalies: [] }),
      },
    })

    expect(result.sources.every((s) => s.ok)).toBe(true)
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
        parks: ok({ readings: [], anomalies: [] }),
        algae: ok({ readings: [], anomalies: [] }),
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
        parks: ok({ readings: [], anomalies: [] }),
        algae: ok({ readings: [], anomalies: [] }),
      },
    })

    const live = await writer.liveStatus()
    expect(live.find((r) => r.beachId === 'hrm-albro-lake')?.state).toBe('open')
    expect(live.find((r) => r.beachId === 'hrm-albro-lake')?.confirmedAt).toBe('2026-08-13T12:00:00.000Z')
  })
})
