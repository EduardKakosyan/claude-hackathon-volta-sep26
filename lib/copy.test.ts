import { describe, expect, it } from 'vitest'

import type { ConditionsView } from './conditions'
import { BASIS_LINE, formatConditions, formatFreshness, offseasonLabel, offseasonLine, PLAIN_ENGLISH, plainEnglish, pushPayload } from './copy'
import { formatClock } from './dates'
import { BEACHES_BY_ID } from './seed/beaches'
import type { LiveStatus, SourceHealthView } from './status'

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

  it('short: the row column out of season — water then wind, no "Wind", no time', () => {
    expect(formatConditions(view({ waterTempC: 16.4 }), { short: true })).toBe('16 °C · 25 km/h SW')
    expect(formatConditions(view(), { short: true })).toBe('25 km/h SW')
    expect(formatConditions(view({ waterTempC: 8.6, windKmh: 30.2, windDir: 'NW' }), { short: true })).toBe('9 °C · 30 km/h NW')
  })

  it('daylight: appends sunrise and sunset in Halifax time after the reading\'s time', () => {
    // 09:23 UTC = 6:23 a.m. ADT; 23:14 UTC = 8:14 p.m. ADT.
    expect(formatConditions(view(), { daylight: true })).toBe('Wind 25 km/h SW · 2 p.m. · Sunrise 6:23 a.m. · Sunset 8:14 p.m.')
    expect(formatConditions(view({ waterTempC: 16.4 }), { daylight: true })).toBe(
      '16 °C water · Wind 25 km/h SW · 2 p.m. · Sunrise 6:23 a.m. · Sunset 8:14 p.m.',
    )
  })

  it('daylight is omitted, not dashed, when the sun does not rise or set that day', () => {
    expect(formatConditions(view({ sunrise: undefined }), { daylight: true })).toBe('Wind 25 km/h SW · 2 p.m.')
    expect(formatConditions(view({ sunset: undefined }), { daylight: true })).not.toMatch(/Sunrise|Sunset/)
  })

  it('never asserts the water is safe: neither the conditions line nor any plain-English line', () => {
    // A status or a temperature reading is not a promise that swimming is safe.
    for (const line of Object.values(PLAIN_ENGLISH)) expect(line).not.toMatch(/water is safe|safe to swim/i)
    expect(formatConditions(view({ waterTempC: 30 }))).not.toMatch(/\bsafe\b/i)
    expect(formatConditions(view({ waterTempC: 30 }), { short: true, daylight: true })).not.toMatch(/\bsafe\b/i)
    expect(offseasonLine('hrm')).not.toMatch(/\bsafe\b/i)
    expect(offseasonLine('province')).not.toMatch(/\bsafe\b/i)
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

describe('status copy', () => {
  it('distinguishes an absent provincial advisory from a passed water test', () => {
    for (const source of ['parks', 'algae', 'season'] as const) {
      expect(PLAIN_ENGLISH[`open:${source}`]).toContain('isn’t confirmation of a passed test')
    }
  })

  it('keeps the swimming and dog warnings in an HRM advisory', () => {
    expect(PLAIN_ENGLISH['advisory:hrm']).toContain('Swimming is not recommended')
    expect(PLAIN_ENGLISH['advisory:hrm']).toContain('dogs should stay out')
    expect(PLAIN_ENGLISH['advisory:hrm']).toContain('aren’t supervising swimming')
  })

  it('labels inferred closures as estimates without claiming no notice was found', () => {
    const line = plainEnglish({
      kind: 'replay',
      beachId: 'hrm-oakfield-park',
      day: '2026-08-01',
      state: 'closed',
      basis: 'inferred',
      note: null,
    })
    expect(line).toBe('The beach was closed to swimming that day.')
    expect(BASIS_LINE.inferred).toBe('Estimated from the records available, not checked on the day.')
    expect(BASIS_LINE.inferred).not.toContain('no notice was found')
  })
})

describe('pushPayload', () => {
  /** 8:02 a.m. ADT on the fixture day, and a `now` the same afternoon so the time reads "today". */
  const POSTED = '2026-08-15T11:02:00.000Z'
  const NOW = new Date('2026-08-15T17:00:00.000Z')
  const chocolate = BEACHES_BY_ID['hrm-chocolate-lake']
  const rissers = BEACHES_BY_ID['ns-rissers']
  const status = (overrides: Partial<LiveStatus>): LiveStatus => ({
    kind: 'live',
    beachId: chocolate.id,
    state: 'advisory',
    source: 'hrm',
    verbatim: 'Risk advisory in effect',
    sourceUrl: 'https://www.halifax.ca/x',
    postedAt: null,
    confirmedAt: POSTED,
    ...overrides,
  })

  it('names the beach and its new state in the title, and quotes the source with when it said so', () => {
    expect(pushPayload(chocolate, status({ postedAt: POSTED }), NOW)).toEqual({
      title: 'Chocolate Lake Beach: advisory',
      body: 'halifax.ca: “Risk advisory in effect” Posted today, 8:02 a.m.',
      beachId: 'hrm-chocolate-lake',
    })
  })

  it('says "Confirmed" when the source has no posting time of its own', () => {
    expect(pushPayload(chocolate, status({ state: 'open', verbatim: 'Open' }), NOW).body).toBe('halifax.ca: “Open” Confirmed today, 8:02 a.m.')
  })

  it('a change back to Open is sent like any other: it is the one people wait for', () => {
    expect(pushPayload(chocolate, status({ state: 'open', verbatim: 'Open' }), NOW).title).toBe('Chocolate Lake Beach: open')
  })

  it('a provincial beach is never called Open: the title carries the same label as the detail', () => {
    const payload = pushPayload(rissers, status({ beachId: rissers.id, state: 'open', source: 'season', verbatim: 'No advisory posted' }), NOW)
    expect(payload.title).toBe('Rissers Beach: no advisory posted')
    expect(payload.body).toBe('No notice posted. Confirmed today, 8:02 a.m.')
  })

  it('a parks card and an algae notice name their sites', () => {
    expect(pushPayload(rissers, status({ beachId: rissers.id, state: 'closed', source: 'parks', verbatim: 'Beach closed — high surf', postedAt: POSTED }), NOW)).toEqual({
      title: 'Rissers Beach: closed',
      body: 'parks.novascotia.ca: “Beach closed — high surf” Posted today, 8:02 a.m.',
      beachId: 'ns-rissers',
    })
    expect(pushPayload(chocolate, status({ state: 'closed', source: 'algae', verbatim: 'Chocolate Lake — Bloom', postedAt: '2026-08-14T13:30:00.000Z' }), NOW).body).toBe(
      'novascotia.ca algae notice: “Chocolate Lake — Bloom” Posted Aug 14, 10:30 a.m.',
    )
  })

  it('the calendar closing the season says when the lifeguards return', () => {
    expect(pushPayload(chocolate, status({ state: 'offseason', source: 'season', verbatim: 'Off-season' }), NOW)).toEqual({
      title: 'Chocolate Lake Beach: off-season',
      body: 'Off-season. Lifeguards return late June.',
      beachId: 'hrm-chocolate-lake',
    })
    expect(pushPayload(rissers, status({ beachId: rissers.id, state: 'offseason', source: 'season', verbatim: 'Off-season' }), NOW).body).toBe(
      'Off-season. Lifeguards return July 1.',
    )
  })

  it('a source with no words of its own is named without a quote', () => {
    expect(pushPayload(chocolate, status({ verbatim: null }), NOW).body).toBe('halifax.ca. Confirmed today, 8:02 a.m.')
    expect(pushPayload(chocolate, status({ verbatim: '   ' }), NOW).body).toBe('halifax.ca. Confirmed today, 8:02 a.m.')
  })

  it('never asserts the water is safe', () => {
    for (const state of ['open', 'advisory', 'closed', 'offseason'] as const) {
      for (const source of ['hrm', 'parks', 'algae', 'season'] as const) {
        for (const beach of [chocolate, rissers]) {
          const { title, body } = pushPayload(beach, status({ state, source, verbatim: 'Open' }), NOW)
          expect(`${title} ${body}`).not.toMatch(/\bsafe\b/i)
        }
      }
    }
  })
})

describe('offseasonLine', () => {
  it('names the authority\'s return, and nothing else', () => {
    expect(offseasonLine('hrm')).toBe('Off-season. Lifeguards return late June.')
    expect(offseasonLine('province')).toBe('Off-season. Lifeguards return July 1.')
  })
})

describe('formatFreshness', () => {
  /** 8:02 a.m. ADT, and a `now` later the same day so the time reads "today". */
  const AT = '2026-09-12T11:02:00.000Z'
  const NOW = new Date('2026-09-12T15:00:00.000Z')
  const AUGUST = '2026-08-31T20:02:00.000Z'
  const clean = (source: SourceHealthView['source'], at = AT): SourceHealthView => ({
    source,
    lastAttemptAt: at,
    lastSuccessAt: at,
    lastError: null,
  })

  it('in season, one part per source in a fixed order, the conditions feeds collapsed', () => {
    const health = [clean('buoy'), clean('algae'), clean('wind'), clean('hrm'), clean('parks')]
    expect(formatFreshness(health, [], NOW)).toBe(
      'HRM checked today, 8:02 a.m. · Province checked today, 8:02 a.m. · Algae feed checked today, 8:02 a.m. · conditions checked today, 8:02 a.m.',
    )
  })

  it('out of season, the authority\'s line replaces its sources\' lines whatever they last said', () => {
    const health = [clean('hrm', AUGUST), clean('parks', AUGUST), clean('algae', AUGUST), clean('wind'), clean('buoy')]
    expect(formatFreshness(health, ['hrm', 'province'], NOW)).toBe(
      'HRM off-season · Province off-season · conditions checked today, 8:02 a.m.',
    )
    expect(formatFreshness([clean('wind'), clean('buoy')], ['hrm', 'province'], NOW)).toBe(
      'HRM off-season · Province off-season · conditions checked today, 8:02 a.m.',
    )
  })

  it('one authority off-season keeps the other\'s source lines', () => {
    const health = [clean('hrm'), clean('algae'), clean('parks', AUGUST), clean('wind'), clean('buoy')]
    expect(formatFreshness(health, ['province'], NOW)).toBe(
      'Province off-season · HRM checked today, 8:02 a.m. · conditions checked today, 8:02 a.m.',
    )
  })

  it('a conditions feed that failed is named on its own, with its last good read', () => {
    const buoy: SourceHealthView = { source: 'buoy', lastAttemptAt: AT, lastSuccessAt: AUGUST, lastError: 'HTTP 503' }
    expect(formatFreshness([clean('wind'), buoy], ['hrm', 'province'], NOW)).toBe(
      'HRM off-season · Province off-season · Wind checked today, 8:02 a.m. · Buoy last checked Aug 31, 5:02 p.m.; updates unavailable since then',
    )
    const never: SourceHealthView = { source: 'wind', lastAttemptAt: AT, lastSuccessAt: null, lastError: 'boom' }
    expect(formatFreshness([never], [], NOW)).toBe('Wind updates unavailable')
  })

  it('says so when nothing has been read in season', () => {
    expect(formatFreshness([], [], NOW)).toBe('No official updates available yet')
  })

  it('the labels the footer uses out of season', () => {
    expect(offseasonLabel('hrm')).toBe('HRM off-season')
    expect(offseasonLabel('province')).toBe('Province off-season')
  })
})
