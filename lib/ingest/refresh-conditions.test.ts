import { describe, expect, it, vi } from 'vitest'

import type { BuoyReading, ConditionsRow } from '@/lib/conditions'
import { MemoryStore } from '@/lib/db/store'
import { refreshConditions, type BuoyFetcher, type WindFetcher } from '@/lib/ingest/refresh-conditions'
import { BEACHES } from '@/lib/seed/beaches'

const NOW = () => new Date('2026-09-13T19:30:00.000Z')

const WIND_ROWS: ConditionsRow[] = BEACHES.slice(0, 3).map((b, i) => ({
  beachId: b.id,
  windKmh: 10 + i,
  windDirDeg: 200,
  airTempC: 18,
  observedAt: '2026-09-13T19:15:00.000Z',
}))

const READING: BuoyReading = { buoy: 'smartatlantic-halifax', waterTempC: 16.1, observedAt: '2026-09-13T18:23:01.000Z' }

const wind = (rows: ConditionsRow[] = WIND_ROWS): WindFetcher => ({ fetch: async () => 'raw', parse: () => rows })
const buoy = (reading: BuoyReading = READING): BuoyFetcher => ({ fetch: async () => 'raw', parse: () => reading })
const failingWind = (message: string): WindFetcher => ({
  fetch: async () => {
    throw new Error(message)
  },
  parse: () => [],
})
const failingBuoy = (message: string): BuoyFetcher => ({
  fetch: async () => {
    throw new Error(message)
  },
  parse: () => READING,
})

describe('refreshConditions', () => {
  it('writes the wind rows and the buoy reading and records both sources healthy', async () => {
    const writer = new MemoryStore()
    const result = await refreshConditions({ writer, now: NOW, fetchers: { wind: wind(), buoy: buoy() } })

    expect(result.sources).toEqual([
      { source: 'wind', ok: true, error: null },
      { source: 'buoy', ok: true, error: null },
    ])
    expect(result.written).toEqual({ conditions: 3, buoy: true })
    expect(await writer.conditions()).toEqual(WIND_ROWS)
    expect(await writer.buoy()).toEqual(READING)
    const health = await writer.health()
    expect(health.map((h) => h.source).sort()).toEqual(['buoy', 'wind'])
    for (const h of health) {
      expect(h.lastAttemptAt).toBe('2026-09-13T19:30:00.000Z')
      expect(h.lastSuccessAt).toBe('2026-09-13T19:30:00.000Z')
      expect(h.lastError).toBeNull()
    }
  })

  it('one feed failing leaves the other\'s rows in place, and keeps the failed feed\'s previous rows', async () => {
    const writer = new MemoryStore()
    await writer.upsertBuoy({ ...READING, waterTempC: 15.0, observedAt: '2026-09-13T12:00:00.000Z' })
    const log = vi.fn()

    const result = await refreshConditions({
      writer,
      now: NOW,
      log,
      fetchers: { wind: wind(), buoy: failingBuoy('ECONNRESET') },
    })

    expect(result.sources.find((s) => s.source === 'wind')).toMatchObject({ ok: true })
    expect(result.sources.find((s) => s.source === 'buoy')).toMatchObject({ ok: false, error: 'Error: ECONNRESET' })
    expect(result.written).toEqual({ conditions: 3, buoy: false })
    expect(await writer.conditions()).toHaveLength(3)
    expect((await writer.buoy())?.waterTempC).toBe(15.0) // untouched
    expect(log).toHaveBeenCalledWith('buoy failed: Error: ECONNRESET')
  })

  it('a failed source keeps its previous lastSuccessAt and records the error, like status does', async () => {
    const writer = new MemoryStore()
    await writer.upsertSourceHealth([
      { source: 'wind', lastAttemptAt: '2026-09-13T18:30:00.000Z', lastSuccessAt: '2026-09-13T18:30:00.000Z', lastError: null },
      { source: 'hrm', lastAttemptAt: '2026-09-13T18:30:00.000Z', lastSuccessAt: '2026-09-13T18:30:00.000Z', lastError: null },
    ])

    await refreshConditions({ writer, now: NOW, fetchers: { wind: failingWind('HTTP 502'), buoy: buoy() } })

    const health = await writer.health()
    expect(health.find((h) => h.source === 'wind')).toEqual({
      source: 'wind',
      lastAttemptAt: '2026-09-13T19:30:00.000Z',
      lastSuccessAt: '2026-09-13T18:30:00.000Z',
      lastError: 'Error: HTTP 502',
    })
    // The status sources' health rows are not this stage's to touch.
    expect(health.find((h) => h.source === 'hrm')?.lastAttemptAt).toBe('2026-09-13T18:30:00.000Z')
  })

  it('a parse failure counts as a failed source too, and writes nothing for it', async () => {
    const writer = new MemoryStore()
    const result = await refreshConditions({
      writer,
      now: NOW,
      fetchers: {
        wind: {
          fetch: async () => 'raw',
          parse: () => {
            throw new Error('35 locations for 36 beaches')
          },
        },
        buoy: buoy(),
      },
    })
    expect(result.sources.find((s) => s.source === 'wind')).toMatchObject({ ok: false, error: /36 beaches/ })
    expect(await writer.conditions()).toEqual([])
    expect(await writer.buoy()).toEqual(READING)
  })

  it('never throws, even when the writer itself fails', async () => {
    const writer = new MemoryStore()
    writer.upsertConditions = async () => {
      throw new Error('supabase beach_conditions upsert: timeout')
    }
    writer.upsertSourceHealth = async () => {
      throw new Error('supabase source_health upsert: timeout')
    }
    const log = vi.fn()

    await expect(
      refreshConditions({ writer, now: NOW, log, fetchers: { wind: wind(), buoy: buoy() } }),
    ).resolves.toMatchObject({
      sources: [
        { source: 'wind', ok: false, error: expect.stringContaining('timeout') },
        { source: 'buoy', ok: true },
      ],
    })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('conditions health write failed'))
  })

  it('hands the fetchers the roster and the clock', async () => {
    const writer = new MemoryStore()
    const roster = BEACHES.slice(0, 2)
    const windFetch = vi.fn(async () => 'raw')
    const buoyFetch = vi.fn(async () => 'raw')
    await refreshConditions({
      writer,
      now: NOW,
      roster,
      fetchers: {
        wind: { fetch: windFetch, parse: (raw, r) => r.map((b) => ({ ...WIND_ROWS[0], beachId: b.id })) },
        buoy: { fetch: buoyFetch, parse: () => READING },
      },
    })
    expect(windFetch).toHaveBeenCalledWith(roster, NOW())
    expect(buoyFetch).toHaveBeenCalledWith(NOW())
    expect(await writer.conditions()).toHaveLength(2)
  })
})
