import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SourceParseError } from '@/lib/ingest/errors'

import { BUOY_WINDOW_HOURS, buoyUrl, parseErddap } from './smartatlantic'

/**
 * Captured 2026-09-13 16:2x ADT with `time>=2026-09-13T04:00:00Z`: four rows,
 * every `surface_temp_avg` null — the sensor gap the research addendum warned
 * about, and the honest shape the parser must survive.
 */
const live = readFileSync(new URL('../__fixtures__/smartatlantic-live.json', import.meta.url), 'utf8')

const table = (rows: unknown[][], columnNames = ['time', 'surface_temp_avg', 'wind_spd_avg', 'air_temp_avg']) =>
  JSON.stringify({ table: { columnNames, columnTypes: [], columnUnits: [], rows } })

describe('buoyUrl', () => {
  it('asks tabledap for the last six hours with an explicit ISO bound, since the dataset\'s time is a String', () => {
    const url = buoyUrl(new Date('2026-09-13T16:20:35.123Z'))
    expect(url).toBe(
      'https://www.smartatlantic.ca/erddap/tabledap/SMA_halifax.json?time,surface_temp_avg,wind_spd_avg,air_temp_avg&time%3E=2026-09-13T10:20:35Z',
    )
    expect(url).not.toContain('now-')
    expect(BUOY_WINDOW_HOURS).toBe(6)
  })
})

describe('parseErddap — captured fixture', () => {
  it('keeps the gap: a null water temperature with the newest row\'s time, never a number', () => {
    expect(parseErddap(live)).toEqual({
      buoy: 'smartatlantic-halifax',
      waterTempC: null,
      observedAt: '2026-09-13T12:23:01.000Z',
    })
  })
})

describe('parseErddap — hand-written tables', () => {
  it('the newest non-null reading wins, even when later rows are null', () => {
    const raw = table([
      ['2026-09-13T10:53:01Z', 15.9, 1.5, 71.7],
      ['2026-09-13T11:23:01Z', 16.1, 0.9, 71.7],
      ['2026-09-13T11:53:01Z', null, 1.4, 71.9],
      ['2026-09-13T12:23:01Z', null, 1.3, 72],
    ])
    expect(parseErddap(raw)).toEqual({ buoy: 'smartatlantic-halifax', waterTempC: 16.1, observedAt: '2026-09-13T11:23:01.000Z' })
  })

  it('orders by time itself rather than trusting row order', () => {
    const raw = table([
      ['2026-09-13T12:23:01Z', 16.4, 1.3, 72],
      ['2026-09-13T10:53:01Z', 15.9, 1.5, 71.7],
    ])
    expect(parseErddap(raw).waterTempC).toBe(16.4)
  })

  it('reads columns by name, whatever their order', () => {
    const raw = table([[16.2, '2026-09-13T12:23:01Z']], ['surface_temp_avg', 'time'])
    expect(parseErddap(raw)).toMatchObject({ waterTempC: 16.2, observedAt: '2026-09-13T12:23:01.000Z' })
  })

  it('skips rows with an unreadable time or a non-numeric temperature', () => {
    const raw = table([
      ['not a time', 16.9, 1, 1],
      ['2026-09-13T12:23:01Z', 'warm', 1, 1],
      ['2026-09-13T11:53:01Z', 15.2, 1, 1],
    ])
    expect(parseErddap(raw).waterTempC).toBe(15.2)
  })

  it('throws on an empty window, a missing table, a missing column, or non-JSON', () => {
    expect(() => parseErddap(table([]))).toThrow(SourceParseError)
    expect(() => parseErddap('{"error":{"code":404}}')).toThrow(SourceParseError)
    expect(() => parseErddap(table([['2026-09-13T12:23:01Z', 1]], ['time', 'wind_spd_avg']))).toThrow(SourceParseError)
    expect(() => parseErddap('Error {')).toThrow(SourceParseError)
  })
})
