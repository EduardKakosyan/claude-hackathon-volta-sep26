import { describe, expect, it } from 'vitest'

import type { ConditionsView } from './conditions'
import { formatConditions, PLAIN_ENGLISH, plainEnglish } from './copy'
import { formatClock } from './dates'

/** 2 p.m. ADT (UTC−3) on the fixture-ish day. */
const TWO_PM = '2026-08-15T17:00:00Z'

const view = (overrides: Partial<ConditionsView> = {}): ConditionsView => ({
  windKmh: 25,
  windDir: 'SW',
  airTempC: 21,
  observedAt: TWO_PM,
  sunrise: '2026-08-15T09:23:00Z',
  sunset: '2026-08-15T23:14:00Z',
  ...overrides,
})

describe('formatClock', () => {
  it('drops the minutes on the hour and keeps them otherwise, in Halifax time', () => {
    expect(formatClock(TWO_PM)).toBe('2 p.m.')
    expect(formatClock('2026-08-15T17:15:00Z')).toBe('2:15 p.m.')
    expect(formatClock('2026-08-15T11:02:00Z')).toBe('8:02 a.m.')
    expect(formatClock('2026-08-15T03:00:00Z')).toBe('12 a.m.')
    expect(formatClock('2026-08-15T15:00:00Z')).toBe('12 p.m.')
  })

  it('is empty for a malformed instant', () => {
    expect(formatClock('yesterday')).toBe('')
  })
})

describe('formatConditions', () => {
  it('leads with the water temperature on an ocean beach near the buoy', () => {
    expect(formatConditions(view({ waterTempC: 16.4 }))).toBe('16 °C water · Wind 25 km/h SW · 2 p.m.')
  })

  it('is wind only on a lake, or where no buoy reaches: no placeholder', () => {
    const line = formatConditions(view())
    expect(line).toBe('Wind 25 km/h SW · 2 p.m.')
    expect(line).not.toMatch(/water|unavailable|—/)
  })

  it('rounds to whole numbers and keeps the reading\'s time, not the page\'s', () => {
    expect(formatConditions(view({ windKmh: 19.4, waterTempC: 15.5, observedAt: '2026-09-13T19:15:00Z' }))).toBe(
      '16 °C water · Wind 19 km/h SW · 4:15 p.m.',
    )
  })

  it('never asserts the water is safe: neither the conditions line nor any plain-English line', () => {
    // HRM's own words ("under the safe limit") are quoted; the app never adds a claim of its own.
    for (const line of Object.values(PLAIN_ENGLISH)) expect(line).not.toMatch(/water is safe|safe to swim/i)
    expect(formatConditions(view({ waterTempC: 30 }))).not.toMatch(/\bsafe\b/i)
    expect(
      plainEnglish({
        kind: 'live',
        beachId: 'x',
        state: 'open',
        source: 'hrm',
        verbatim: 'Open',
        sourceUrl: 'u',
        postedAt: null,
        confirmedAt: TWO_PM,
      }),
    ).not.toMatch(/water is safe|safe to swim/i)
  })
})
