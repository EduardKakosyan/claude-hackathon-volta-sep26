import { describe, expect, it } from 'vitest'

import { daysBetween, inProvincialSeason } from './halifax-day'

describe('inProvincialSeason', () => {
  it('is true only within July 1 - August 30 inclusive, any year', () => {
    expect(inProvincialSeason('2026-06-30')).toBe(false)
    expect(inProvincialSeason('2026-07-01')).toBe(true)
    expect(inProvincialSeason('2026-08-30')).toBe(true)
    expect(inProvincialSeason('2026-08-31')).toBe(false)
    expect(inProvincialSeason('2027-07-15')).toBe(true)
  })
})

describe('daysBetween', () => {
  it('returns to − from in whole days', () => {
    expect(daysBetween('2026-08-31', '2026-09-12')).toBe(12)
    expect(daysBetween('2026-09-12', '2026-08-31')).toBe(-12)
    expect(daysBetween('2026-09-12', '2026-09-12')).toBe(0)
  })
})
