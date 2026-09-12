import { describe, expect, it } from 'vitest'

import { BEACHES, BEACHES_BY_ID } from '@/lib/seed/beaches'
import {
  HALIFAX,
  REGION_ORDER,
  formatDistance,
  groupByRegion,
  haversineKm,
  nearest,
  resolveOrigin,
  sortByDistance,
} from './geo'

const chocolate = BEACHES_BY_ID['hrm-chocolate-lake']
const longPond = BEACHES_BY_ID['hrm-long-pond']

describe('haversineKm', () => {
  it('measures Chocolate Lake to Long Pond at about 7.8 km', () => {
    expect(haversineKm(chocolate, longPond)).toBeCloseTo(7.82, 1)
  })
  it('is zero on itself and symmetric', () => {
    expect(haversineKm(chocolate, chocolate)).toBe(0)
    expect(haversineKm(chocolate, longPond)).toBeCloseTo(haversineKm(longPond, chocolate), 9)
  })
  it('reaches Cape Breton', () => {
    expect(haversineKm(HALIFAX, BEACHES_BY_ID['ns-point-michaud'])).toBeCloseTo(250.5, 0)
  })
})

describe('formatDistance', () => {
  it.each([
    [7.824, '7.8 km'],
    [17.4, '17 km'],
    [9.97, '10 km'],
    [0.04, '<0.1 km'],
    [0.95, '0.9 km'],
    [327.1, '327 km'],
  ])('%s km → %s', (km, text) => {
    expect(formatDistance(km)).toBe(text)
  })
  it('renders nothing for garbage', () => {
    expect(formatDistance(Number.NaN)).toBe('')
    expect(formatDistance(-1)).toBe('')
  })
})

describe('sortByDistance / nearest', () => {
  it('puts the four Halifax-peninsula beaches first from the fallback origin', () => {
    expect(nearest(BEACHES, HALIFAX, 4).map((b) => b.id)).toEqual([
      'hrm-chocolate-lake',
      'hrm-cunard-pond',
      'hrm-birch-cove',
      'hrm-albro-lake',
    ])
  })
  it('ends at Dominion Beach', () => {
    const all = sortByDistance(BEACHES, HALIFAX)
    expect(all).toHaveLength(35)
    expect(all.at(-1)?.id).toBe('ns-dominion')
    expect(all.at(-1)?.km).toBeGreaterThan(300)
  })
  it('breaks ties by id and never mutates its input', () => {
    const twins = [
      { id: 'b', lat: 44.7, lon: -63.6 },
      { id: 'a', lat: 44.7, lon: -63.6 },
    ]
    const copy = [...twins]
    expect(sortByDistance(twins, HALIFAX).map((t) => t.id)).toEqual(['a', 'b'])
    expect(twins).toEqual(copy)
  })
  it('clamps the limit', () => {
    expect(nearest(BEACHES, HALIFAX, 100)).toHaveLength(35)
    expect(nearest(BEACHES, HALIFAX, 0)).toHaveLength(0)
  })
})

describe('groupByRegion', () => {
  it('covers all 35 beaches in REGION_ORDER with the roster counts', () => {
    const groups = groupByRegion(BEACHES, HALIFAX)
    expect(groups.map((g) => g.region)).toEqual([...REGION_ORDER])
    expect(groups.map((g) => g.beaches.length)).toEqual([19, 4, 3, 3, 4, 2])
    expect(groups.flatMap((g) => g.beaches)).toHaveLength(35)
  })
  it('sorts each group by distance', () => {
    for (const group of groupByRegion(BEACHES, HALIFAX)) {
      const km = group.beaches.map((b) => b.km)
      expect(km).toEqual([...km].sort((a, b) => a - b))
    }
  })
  it('omits empty groups', () => {
    const capeBretonOnly = BEACHES.filter((b) => b.region === 'Cape Breton')
    expect(groupByRegion(capeBretonOnly, HALIFAX).map((g) => g.region)).toEqual(['Cape Breton'])
  })
})

describe('resolveOrigin', () => {
  it('falls back to Halifax without a position', () => {
    expect(resolveOrigin(null)).toEqual({ origin: HALIFAX, originKind: 'halifax', farFromNovaScotia: false })
  })
  it('uses a Dartmouth position', () => {
    const dartmouth = { lat: 44.6714, lon: -63.5772 }
    expect(resolveOrigin(dartmouth)).toEqual({ origin: dartmouth, originKind: 'user', farFromNovaScotia: false })
  })
  it('falls back for a Toronto position and says why', () => {
    expect(resolveOrigin({ lat: 43.6532, lon: -79.3832 })).toEqual({
      origin: HALIFAX,
      originKind: 'halifax',
      farFromNovaScotia: true,
    })
  })
})
