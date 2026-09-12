import { describe, expect, it } from 'vitest'

import { BEACHES } from '@/lib/seed/beaches'
import { normalizeQuery, searchBeaches } from './search'

const ids = (q: string, limit?: number) =>
  searchBeaches(q, BEACHES, limit === undefined ? undefined : { limit }).map((h) => h.beach.id)

describe('normalizeQuery', () => {
  it.each([
    ["Risser's", 'rissers'],
    ['St. Margarets', 'st margarets'],
    ['  Porters   LAKE ', 'porters lake'],
    ['Pomquét', 'pomquet'],
    ['', ''],
    ['   ', ''],
  ])('%j → %j', (input, output) => {
    expect(normalizeQuery(input)).toBe(output)
  })
})

describe('searchBeaches against the real roster', () => {
  it('"Grand Lake" finds Oakfield Park Beach only — Dollar Lake has no "Grand Lake" field', () => {
    // The PRD/outline example listing Dollar Lake is not supported by the roster.
    expect(ids('Grand Lake')).toEqual(['hrm-oakfield-park'])
    expect(searchBeaches('Grand Lake', BEACHES)[0]).toMatchObject({
      field: 'waterBody',
      matched: 'Shubenacadie Grand Lake',
    })
  })
  it('"porters" finds Kinap', () => {
    expect(ids('porters')).toEqual(['hrm-kinap'])
  })
  it('"Dollar" finds Dollar Lake', () => {
    expect(ids('Dollar')).toEqual(['ns-dollar-lake'])
  })
  it('"Banook" finds Birch Cove through the lake alias list', () => {
    expect(searchBeaches('Banook', BEACHES)).toMatchObject([
      { beach: { id: 'hrm-birch-cove' }, field: 'waterBody', matched: 'Lake Banook' },
    ])
  })
  it('"Dartmouth" finds the four Dartmouth beaches by community', () => {
    expect(ids('Dartmouth').sort()).toEqual([
      'hrm-albro-lake',
      'hrm-birch-cove',
      'hrm-penhorn-lake',
      'hrm-shubie-park',
    ])
  })
  it("tolerates apostrophes and dots: \"Risser's\", \"st. margarets\"", () => {
    expect(ids("Risser's")).toEqual(['ns-rissers'])
    expect(ids('st. margarets').sort()).toEqual(['ns-bayswater', 'ns-queensland'])
    expect(ids('St Margarets').sort()).toEqual(['ns-bayswater', 'ns-queensland'])
  })
  it('returns nothing for empty, whitespace, or unknown queries', () => {
    expect(ids('')).toEqual([])
    expect(ids('   ')).toEqual([])
    expect(ids('xyz')).toEqual([])
  })
  it('ranks name matches above water-body-only matches for "lake"', () => {
    const hits = searchBeaches('lake', BEACHES, { limit: Infinity })
    expect(hits).toHaveLength(18)
    const firstWaterBodyOnly = hits.findIndex((h) => h.field !== 'name')
    const lastName = hits.map((h) => h.field).lastIndexOf('name')
    expect(lastName).toBeLessThan(firstWaterBodyOnly)
    expect(hits.filter((h) => h.field === 'name')).toHaveLength(9)
  })
  it('caps at 8 by default and honours a custom limit', () => {
    expect(ids('a')).toHaveLength(8)
    expect(ids('a', Infinity)).toHaveLength(35)
    expect(ids('a', 3)).toHaveLength(3)
  })
  it('does not index parser aliases such as the "Mavilette" misspelling', () => {
    expect(ids('Mavilette')).toEqual([])
    expect(ids('Mavillette')).toEqual(['ns-mavillette'])
  })
  it('returns one hit per beach', () => {
    const all = ids('a', Infinity)
    expect(new Set(all).size).toBe(all.length)
  })
})
