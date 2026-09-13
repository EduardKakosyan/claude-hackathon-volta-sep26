import { describe, expect, it } from 'vitest'

import {
  BUOY_REACH_KM,
  BUOY_STALE_AFTER_MS,
  compassPoint,
  HALIFAX_BUOY,
  mergeConditions,
  STALE_AFTER_MS,
  withinBuoyReach,
  type ConditionsRow,
} from './conditions'
import { haversineKm } from './geo'
import { BEACHES, BEACHES_BY_ID } from './seed/beaches'

const NOW = new Date('2026-09-12T15:00:00Z')
const FRESH = '2026-09-12T14:45:00Z'

const row = (beachId: string, overrides: Partial<ConditionsRow> = {}): ConditionsRow => ({
  beachId,
  windKmh: 25,
  windDirDeg: 225,
  airTempC: 18.2,
  observedAt: FRESH,
  ...overrides,
})

const BUOY = { buoy: HALIFAX_BUOY.id, waterTempC: 16.1, observedAt: '2026-09-12T12:23:01Z' }

describe('compassPoint', () => {
  it('maps degrees to the nearest of eight points, wrapping at north', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(22)).toBe('N')
    expect(compassPoint(23)).toBe('NE')
    expect(compassPoint(90)).toBe('E')
    expect(compassPoint(135)).toBe('SE')
    expect(compassPoint(179)).toBe('S')
    expect(compassPoint(225)).toBe('SW')
    expect(compassPoint(270)).toBe('W')
    expect(compassPoint(315)).toBe('NW')
    expect(compassPoint(338)).toBe('N')
    expect(compassPoint(-45)).toBe('NW')
  })
})

describe('withinBuoyReach', () => {
  it('draws the line between Taylor Head (in) and Melmerby (out), and never includes a lake', () => {
    const taylorHead = BEACHES_BY_ID['hrm-taylor-head']
    const melmerby = BEACHES_BY_ID['ns-melmerby']
    expect(haversineKm(taylorHead, HALIFAX_BUOY)).toBeLessThan(BUOY_REACH_KM)
    expect(haversineKm(melmerby, HALIFAX_BUOY)).toBeGreaterThan(BUOY_REACH_KM)
    expect(withinBuoyReach(taylorHead)).toBe(true)
    expect(withinBuoyReach(melmerby)).toBe(false)
    // Long Pond is 3 km from the buoy and fresh water: no water figure, ever.
    expect(withinBuoyReach(BEACHES_BY_ID['hrm-long-pond'])).toBe(false)
  })

  it('exactly nine roster beaches are within reach', () => {
    expect(BEACHES.filter(withinBuoyReach).map((b) => b.id).sort()).toEqual([
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
  })
})

describe('mergeConditions', () => {
  it('builds a view per beach with a fresh wind row, and none for the rest', () => {
    const out = mergeConditions({
      rows: [row('hrm-chocolate-lake'), row('ns-rainbow-haven', { windKmh: 31.4, windDirDeg: 90 })],
      buoy: null,
      beaches: BEACHES,
      now: NOW,
    })
    expect(Object.keys(out).sort()).toEqual(['hrm-chocolate-lake', 'ns-rainbow-haven'])
    expect(out['hrm-chocolate-lake']).toMatchObject({ windKmh: 25, windDir: 'SW', airTempC: 18.2, observedAt: FRESH })
    expect(out['ns-rainbow-haven']).toMatchObject({ windKmh: 31.4, windDir: 'E' })
    expect(out['ns-rainbow-haven']?.waterTempC).toBeUndefined()
    expect(out['hrm-birch-cove']).toBeUndefined()
  })

  it('treats a wind row older than STALE_AFTER_MS as absent, to the millisecond', () => {
    const edge = new Date(NOW.getTime() - STALE_AFTER_MS).toISOString()
    const past = new Date(NOW.getTime() - STALE_AFTER_MS - 1).toISOString()
    const out = mergeConditions({
      rows: [row('hrm-chocolate-lake', { observedAt: edge }), row('hrm-birch-cove', { observedAt: past })],
      buoy: null,
      beaches: BEACHES,
      now: NOW,
    })
    expect(out['hrm-chocolate-lake']).toBeDefined()
    expect(out['hrm-birch-cove']).toBeUndefined()
  })

  it('joins the buoy to salt beaches within reach only, with the buoy\'s own time', () => {
    const out = mergeConditions({
      rows: [row('ns-rainbow-haven'), row('ns-melmerby'), row('hrm-long-pond')],
      buoy: BUOY,
      beaches: BEACHES,
      now: NOW,
    })
    expect(out['ns-rainbow-haven']).toMatchObject({ waterTempC: 16.1, waterObservedAt: BUOY.observedAt })
    expect(out['ns-melmerby']?.waterTempC).toBeUndefined()
    expect(out['hrm-long-pond']?.waterTempC).toBeUndefined()
  })

  it('a null sensor reading contributes nothing: no water figure, no placeholder', () => {
    const out = mergeConditions({
      rows: [row('ns-rainbow-haven')],
      buoy: { ...BUOY, waterTempC: null },
      beaches: BEACHES,
      now: NOW,
    })
    expect(out['ns-rainbow-haven']).toBeDefined()
    expect(out['ns-rainbow-haven']?.waterTempC).toBeUndefined()
    expect('waterTempC' in out['ns-rainbow-haven']!).toBe(false)
  })

  it('a buoy reading older than its own window is absent, while the wind stays', () => {
    const old = new Date(NOW.getTime() - BUOY_STALE_AFTER_MS - 1000).toISOString()
    const out = mergeConditions({
      rows: [row('ns-rainbow-haven')],
      buoy: { ...BUOY, observedAt: old },
      beaches: BEACHES,
      now: NOW,
    })
    expect(out['ns-rainbow-haven']?.windKmh).toBe(25)
    expect(out['ns-rainbow-haven']?.waterTempC).toBeUndefined()
  })

  it('omits the air temperature when the row has none', () => {
    const out = mergeConditions({ rows: [row('hrm-chocolate-lake', { airTempC: null })], buoy: null, beaches: BEACHES, now: NOW })
    expect('airTempC' in out['hrm-chocolate-lake']!).toBe(false)
  })

  it('computes sunrise and sunset for the beach on the day, in Halifax daylight hours', () => {
    const out = mergeConditions({ rows: [row('ns-rainbow-haven')], buoy: null, beaches: BEACHES, now: NOW })
    const { sunrise, sunset } = out['ns-rainbow-haven']!
    // 12 September in Halifax: sunrise about 6:50 a.m. ADT (09:50Z), sunset about 7:30 p.m. ADT (22:30Z).
    expect(sunrise).toMatch(/^2026-09-12T09:[45]\d/)
    expect(sunset).toMatch(/^2026-09-12T22:[23]\d/)
  })

  it('ignores rows for beaches that are not on the roster', () => {
    const out = mergeConditions({ rows: [row('nowhere')], buoy: null, beaches: BEACHES, now: NOW })
    expect(out).toEqual({})
  })
})
