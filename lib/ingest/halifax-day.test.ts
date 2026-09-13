import { describe, expect, it } from 'vitest'

import { daysBetween, halifaxDay } from './halifax-day'

describe('halifaxDay', () => {
  it('is the Halifax calendar day of the instant, whatever the server clock zone', () => {
    // 01:30 UTC on the 13th is 22:30 ADT on the 12th.
    expect(halifaxDay('2026-09-13T01:30:00.000Z')).toBe('2026-09-12')
    expect(halifaxDay(new Date('2026-09-13T12:00:00.000Z'))).toBe('2026-09-13')
  })
})

describe('daysBetween', () => {
  it('returns to − from in whole days', () => {
    expect(daysBetween('2026-08-31', '2026-09-12')).toBe(12)
    expect(daysBetween('2026-09-12', '2026-08-31')).toBe(-12)
    expect(daysBetween('2026-09-12', '2026-09-12')).toBe(0)
  })
})
