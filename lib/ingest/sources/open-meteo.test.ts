import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { SourceParseError } from '@/lib/ingest/errors'
import { BEACHES } from '@/lib/seed/beaches'

import { localToInstant, openMeteoUrl, parseOpenMeteo } from './open-meteo'

/** Captured 2026-09-13 16:2x ADT: one batched call for all 35 roster coordinates. */
const live = readFileSync(new URL('../__fixtures__/open-meteo-live.json', import.meta.url), 'utf8')

describe('openMeteoUrl', () => {
  it('batches every roster coordinate into one call with the three current fields, Halifax time', () => {
    const url = new URL(openMeteoUrl())
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(url.searchParams.get('latitude')!.split(',')).toHaveLength(BEACHES.length)
    expect(url.searchParams.get('longitude')!.split(',')).toHaveLength(BEACHES.length)
    expect(url.searchParams.get('current')).toBe('wind_speed_10m,wind_direction_10m,temperature_2m')
    expect(url.searchParams.get('timezone')).toBe('America/Halifax')
  })
})

describe('localToInstant', () => {
  it('applies the payload\'s UTC offset to the local current.time', () => {
    expect(localToInstant('2026-09-13T16:15', -10800)).toBe('2026-09-13T19:15:00.000Z')
    expect(localToInstant('2026-01-05T08:00:30', -14400)).toBe('2026-01-05T12:00:30.000Z')
  })

  it('rejects anything that is not a local ISO minute', () => {
    expect(() => localToInstant('16:15', -10800)).toThrow(SourceParseError)
  })
})

describe('parseOpenMeteo — captured fixture', () => {
  const rows = parseOpenMeteo(live)

  it('returns one row per roster beach, in roster order, matched through location_id', () => {
    expect(rows).toHaveLength(BEACHES.length)
    expect(rows.map((r) => r.beachId)).toEqual(BEACHES.map((b) => b.id))
  })

  it('carries wind in km/h, a whole-degree direction, air temperature, and the reading\'s UTC instant', () => {
    for (const r of rows) {
      expect(r.windKmh).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(r.windDirDeg)).toBe(true)
      expect(r.windDirDeg).toBeGreaterThanOrEqual(0)
      expect(r.windDirDeg).toBeLessThanOrEqual(360)
      expect(typeof r.airTempC).toBe('number')
      expect(r.observedAt).toBe('2026-09-13T19:15:00.000Z') // current.time 16:15 at UTC−3
    }
    expect(rows[0]).toMatchObject({ beachId: 'hrm-albro-lake', windKmh: 19.4, windDirDeg: 179, airTempC: 20 })
  })

  it('the coordinates Open-Meteo snapped to sit next to the roster\'s', () => {
    const payload = JSON.parse(live) as { latitude: number; longitude: number }[]
    payload.forEach((loc, i) => {
      expect(Math.abs(loc.latitude - BEACHES[i].lat)).toBeLessThan(0.1)
      expect(Math.abs(loc.longitude - BEACHES[i].lon)).toBeLessThan(0.1)
    })
  })
})

describe('parseOpenMeteo — hand-written payloads', () => {
  const roster = BEACHES.slice(0, 2)
  const location = (extra: Record<string, unknown>, current: Record<string, unknown>) => ({
    latitude: 44.7,
    longitude: -63.6,
    utc_offset_seconds: -10800,
    ...extra,
    current: { time: '2026-09-13T16:15', interval: 900, wind_speed_10m: 10, wind_direction_10m: 90.4, temperature_2m: 20, ...current },
  })

  it('a single location comes back as an object, not an array', () => {
    const rows = parseOpenMeteo(JSON.stringify(location({}, {})), roster.slice(0, 1))
    expect(rows).toEqual([
      { beachId: roster[0].id, windKmh: 10, windDirDeg: 90, airTempC: 20, observedAt: '2026-09-13T19:15:00.000Z' },
    ])
  })

  it('a missing air temperature is a gap (null); a missing wind is a malformed payload', () => {
    const noAir = [location({}, { temperature_2m: undefined }), location({ location_id: 1 }, {})]
    expect(parseOpenMeteo(JSON.stringify(noAir), roster)[0].airTempC).toBeNull()

    const noWind = [location({}, { wind_speed_10m: null }), location({ location_id: 1 }, {})]
    expect(() => parseOpenMeteo(JSON.stringify(noWind), roster)).toThrow(SourceParseError)
  })

  it('refuses a payload whose location count does not match the roster', () => {
    expect(() => parseOpenMeteo(JSON.stringify([location({}, {})]), roster)).toThrow(/1 locations for 2 beaches/)
  })

  it('refuses a duplicated or out-of-range location_id', () => {
    const dup = [location({}, {}), location({ location_id: 0 }, {})]
    expect(() => parseOpenMeteo(JSON.stringify(dup), roster)).toThrow(SourceParseError)
    const far = [location({}, {}), location({ location_id: 7 }, {})]
    expect(() => parseOpenMeteo(JSON.stringify(far), roster)).toThrow(SourceParseError)
  })

  it('surfaces Open-Meteo\'s own error reason, and rejects non-JSON', () => {
    expect(() => parseOpenMeteo('{"error":true,"reason":"Latitude must be in range"}', roster)).toThrow(
      /Latitude must be in range/,
    )
    expect(() => parseOpenMeteo('<html>', roster)).toThrow(SourceParseError)
  })
})
