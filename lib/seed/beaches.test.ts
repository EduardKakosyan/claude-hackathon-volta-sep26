import { describe, expect, it } from 'vitest'

import { BEACHES, BEACHES_BY_ID } from './beaches'

/**
 * Nova Scotia's bounding box, generous by about half a degree on every side.
 * A swapped lat/lon puts a pin in the Atlantic off Morocco, which fails here
 * rather than on a judge's phone.
 */
const NS_BOUNDS = { minLat: 43.3, maxLat: 47.1, minLon: -66.5, maxLon: -59.6 }

describe('the 35-beach roster', () => {
  it('has 35 beaches, 18 HRM and 17 provincial', () => {
    expect(BEACHES).toHaveLength(35)
    expect(BEACHES.filter((b) => b.authority === 'hrm')).toHaveLength(18)
    expect(BEACHES.filter((b) => b.authority === 'province')).toHaveLength(17)
  })

  it('has unique ids, prefixed by authority', () => {
    const ids = BEACHES.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(BEACHES_BY_ID)).toHaveLength(35)

    for (const b of BEACHES) {
      expect(b.id).toMatch(b.authority === 'hrm' ? /^hrm-/ : /^ns-/)
      expect(b.id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('gives every HRM beach a unique halifax.ca table name, and no provincial beach one', () => {
    const hrm = BEACHES.filter((b) => b.authority === 'hrm')
    const names = hrm.map((b) => b.match.hrmTable)

    expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true)
    expect(new Set(names).size).toBe(hrm.length)

    for (const b of BEACHES.filter((x) => x.authority === 'province')) {
      expect(b.match.hrmTable).toBeUndefined()
    }
  })

  it('gives every provincial beach at least one advisory-card alias, and no HRM beach one', () => {
    for (const b of BEACHES.filter((x) => x.authority === 'province')) {
      expect(b.match.parksText?.length ?? 0).toBeGreaterThan(0)
      for (const alias of b.match.parksText ?? []) {
        expect(alias.trim()).toBe(alias)
        expect(alias).not.toBe('')
      }
    }

    for (const b of BEACHES.filter((x) => x.authority === 'hrm')) {
      expect(b.match.parksText).toBeUndefined()
    }
  })

  it('only claims lake aliases for freshwater and brackish beaches', () => {
    for (const b of BEACHES) {
      if (!b.match.lakes) continue
      expect(b.match.lakes.length).toBeGreaterThan(0)
      expect(b.waterBody).not.toBe('Atlantic Ocean')
    }
  })

  it('puts every coordinate inside Nova Scotia', () => {
    for (const b of BEACHES) {
      expect(
        b.lat,
        `${b.id} latitude ${b.lat} is outside Nova Scotia`,
      ).toBeGreaterThanOrEqual(NS_BOUNDS.minLat)
      expect(b.lat, `${b.id} latitude`).toBeLessThanOrEqual(NS_BOUNDS.maxLat)
      expect(
        b.lon,
        `${b.id} longitude ${b.lon} is outside Nova Scotia`,
      ).toBeGreaterThanOrEqual(NS_BOUNDS.minLon)
      expect(b.lon, `${b.id} longitude`).toBeLessThanOrEqual(NS_BOUNDS.maxLon)
    }
  })

  it('never puts two beaches on the same point', () => {
    const points = BEACHES.map((b) => `${b.lat},${b.lon}`)
    expect(new Set(points).size).toBe(points.length)
  })

  it('fills in every rendered field and links to a government page', () => {
    for (const b of BEACHES) {
      expect(b.name, b.id).not.toBe('')
      expect(b.waterBody, b.id).not.toBe('')
      expect(b.community, b.id).not.toBe('')
      expect(b.supervision, b.id).not.toBe('')
      expect(b.sourceUrl, b.id).toMatch(
        /^https:\/\/(www\.halifax\.ca|parks\.novascotia\.ca)\//,
      )
    }
  })
})
