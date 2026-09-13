import { describe, expect, it } from 'vitest'

import { BEACHES, BEACHES_BY_ID } from '@/lib/seed/beaches'
import {
  HALIFAX,
  formatDistance,
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

describe('resolveOrigin', () => {
  it('falls back to Halifax without a position', () => {
    expect(resolveOrigin(null)).toEqual({ kind: 'halifax', point: HALIFAX, far: false })
    expect(resolveOrigin(undefined)).toEqual({ kind: 'halifax', point: HALIFAX, far: false })
  })
  it('uses a Dartmouth position', () => {
    const dartmouth = { lat: 44.6714, lon: -63.5772 }
    expect(resolveOrigin(dartmouth)).toEqual({ kind: 'user', point: dartmouth, far: false })
  })
  it('keeps a Toronto position — honest distances — and flags it as far', () => {
    const toronto = { lat: 43.6532, lon: -79.3832 }
    expect(resolveOrigin(toronto)).toEqual({ kind: 'user', point: toronto, far: true })
  })
  it('a position just inside the province is not far', () => {
    // Yarmouth: about 210 km from Halifax as the crow flies.
    expect(resolveOrigin({ lat: 43.8374, lon: -66.1174 }).far).toBe(false)
  })
})
