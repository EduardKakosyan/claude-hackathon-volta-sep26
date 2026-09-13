import { describe, expect, it } from 'vitest'

import { BEACHES } from '@/lib/seed/beaches'
import type { LiveStatus, StatusView } from '@/lib/status'

import { inSeason, offseasonAuthorities, offseasonStatus, SEASON } from './season'

describe('inSeason', () => {
  it('HRM: June 27 – August 31 inclusive, any year', () => {
    expect(inSeason('hrm', '2026-06-26')).toBe(false)
    expect(inSeason('hrm', '2026-06-27')).toBe(true)
    expect(inSeason('hrm', '2026-07-15')).toBe(true)
    expect(inSeason('hrm', '2026-08-31')).toBe(true)
    expect(inSeason('hrm', '2026-09-01')).toBe(false)
    expect(inSeason('hrm', '2027-06-27')).toBe(true)
  })

  it('province: July 1 – August 30 inclusive, any year', () => {
    expect(inSeason('province', '2026-06-30')).toBe(false)
    expect(inSeason('province', '2026-07-01')).toBe(true)
    expect(inSeason('province', '2026-08-30')).toBe(true)
    expect(inSeason('province', '2026-08-31')).toBe(false)
    expect(inSeason('province', '2027-07-15')).toBe(true)
  })

  it('the two windows differ at both ends, so a day can be in season for one authority only', () => {
    expect(inSeason('hrm', '2026-06-28')).toBe(true)
    expect(inSeason('province', '2026-06-28')).toBe(false)
    expect(inSeason('hrm', '2026-08-31')).toBe(true)
    expect(inSeason('province', '2026-08-31')).toBe(false)
  })

  it('mid-September, when this app is being finished, is off-season for both', () => {
    expect(inSeason('hrm', '2026-09-13')).toBe(false)
    expect(inSeason('province', '2026-09-13')).toBe(false)
  })

  it('the return copy names a time, never a claim about the water', () => {
    expect(SEASON.hrm.returns).toBe('late June')
    expect(SEASON.province.returns).toBe('July 1')
  })
})

describe('offseasonStatus', () => {
  it('is a live row from source season with the beach\'s own government page', () => {
    const beach = BEACHES.find((b) => b.id === 'ns-rissers')!
    expect(offseasonStatus(beach, '2026-09-13T11:02:00.000Z')).toEqual({
      kind: 'live',
      beachId: 'ns-rissers',
      state: 'offseason',
      source: 'season',
      verbatim: 'Off-season',
      sourceUrl: beach.sourceUrl,
      postedAt: null,
      confirmedAt: '2026-09-13T11:02:00.000Z',
    })
  })
})

describe('offseasonAuthorities', () => {
  const NOW = '2026-09-13T11:02:00.000Z'
  const allOff = (): Record<string, StatusView | undefined> =>
    Object.fromEntries(BEACHES.map((b) => [b.id, offseasonStatus(b, NOW)]))

  it('names both authorities when every beach carries the out-of-season row', () => {
    expect(offseasonAuthorities(BEACHES, allOff())).toEqual(['hrm', 'province'])
  })

  it('names only the authority whose beaches all carry it', () => {
    const status = allOff()
    const rissers: LiveStatus = {
      kind: 'live',
      beachId: 'ns-rissers',
      state: 'closed',
      source: 'parks',
      verbatim: 'Rissers Beach – Closed for Construction',
      sourceUrl: 'https://parks.novascotia.ca/advisories',
      postedAt: null,
      confirmedAt: NOW,
    }
    status['ns-rissers'] = rissers
    expect(offseasonAuthorities(BEACHES, status)).toEqual(['hrm'])
  })

  it('a source saying "Supervision ended" in season is not the calendar: the authority was read', () => {
    const status = allOff()
    for (const beach of BEACHES) {
      if (beach.authority !== 'hrm') continue
      status[beach.id] = {
        kind: 'live',
        beachId: beach.id,
        state: 'offseason',
        source: 'hrm',
        verbatim: 'Supervision ended for the season',
        sourceUrl: beach.sourceUrl,
        postedAt: null,
        confirmedAt: NOW,
      }
    }
    expect(offseasonAuthorities(BEACHES, status)).toEqual(['province'])
  })

  it('is empty with no status at all, and on a replay day', () => {
    expect(offseasonAuthorities(BEACHES, {})).toEqual([])
    const replay: Record<string, StatusView | undefined> = Object.fromEntries(
      BEACHES.map((b) => [b.id, { kind: 'replay', beachId: b.id, day: '2026-09-13', state: 'offseason', basis: 'scraped', note: null }]),
    )
    expect(offseasonAuthorities(BEACHES, replay)).toEqual([])
  })
})
