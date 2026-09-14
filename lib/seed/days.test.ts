import { describe, expect, it } from 'vitest'

import { addDays } from '@/lib/dates'

import { BEACHES, BEACHES_BY_ID } from './beaches'
import { SEED_DAYS, SEED_FROM, SEED_TO } from './days'

const STATES = new Set(['open', 'advisory', 'closed', 'offseason'])
const HRM = BEACHES.filter((b) => b.authority === 'hrm').map((b) => b.id)
const PROVINCE = BEACHES.filter((b) => b.authority === 'province').map((b) => b.id)

describe('seeded replay days', () => {
  it('runs every day from the first of the year to the day before the refresh took over', () => {
    const days = Object.keys(SEED_DAYS).sort()
    expect(days[0]).toBe(SEED_FROM)
    expect(days.at(-1)).toBe(SEED_TO)
    expect(SEED_TO).toBe('2026-09-12')
    let expected = SEED_FROM
    for (const day of days) {
      expect(day).toBe(expected)
      expected = addDays(expected, 1)
    }
    expect(days).toHaveLength(255)
  })

  it('covers every roster id, and nothing else, with a valid state and a note', () => {
    for (const [day, rows] of Object.entries(SEED_DAYS)) {
      const ids = Object.keys(rows)
      expect(ids, day).toHaveLength(BEACHES.length)
      for (const id of ids) {
        expect(BEACHES_BY_ID[id], `${day}: ${id} is not on the roster`).toBeDefined()
        expect(STATES.has(rows[id].state), `${day}: ${id}`).toBe(true)
        expect(rows[id].note.length, `${day}: ${id} needs a note`).toBeGreaterThan(0)
      }
    }
  })

  it('claims verification for an open pin only from an archived table or a dated reopening', () => {
    // An ordinary open day is the absence of a notice, which no article records.
    for (const [day, rows] of Object.entries(SEED_DAYS)) {
      for (const [id, row] of Object.entries(rows)) {
        if (row.basis === 'verified' && row.state === 'open') {
          expect(row.note, `${day}: ${id}`).toMatch(/archived|reopens|lifted/)
        }
      }
    }
  })

  it('is off-season by the calendar outside each authority’s window, and never inside it', () => {
    for (const [day, rows] of Object.entries(SEED_DAYS)) {
      const hrmIn = day >= '2026-07-01' && day <= '2026-08-31'
      const provinceIn = day >= '2026-07-01' && day <= '2026-08-30'
      for (const id of HRM) {
        expect(rows[id].state === 'offseason', `${day}: ${id}`).toBe(!hrmIn)
        expect(rows[id].basis === 'calendar', `${day}: ${id}`).toBe(!hrmIn)
      }
      for (const id of PROVINCE) {
        expect(rows[id].state === 'offseason', `${day}: ${id}`).toBe(!provinceIn)
        expect(rows[id].basis === 'calendar', `${day}: ${id}`).toBe(!provinceIn)
      }
    }
  })

  it('carries the two archived tables as verified rows', () => {
    const july1 = SEED_DAYS['2026-07-01']
    expect(july1['hrm-kearney-lake']).toMatchObject({ state: 'advisory', basis: 'verified' })
    expect(july1['hrm-kidston-lake']).toMatchObject({ state: 'advisory', basis: 'verified' })
    expect(july1['hrm-chocolate-lake']).toMatchObject({ state: 'open', basis: 'verified' })
    expect(july1['hrm-kearney-lake'].note).toContain('170, 110, 150, 160, 140')
    expect(HRM.filter((id) => july1[id].state === 'advisory')).toHaveLength(5)

    const july24 = SEED_DAYS['2026-07-24']
    expect(july24['hrm-albro-lake']).toMatchObject({ state: 'advisory', basis: 'verified' })
    expect(july24['hrm-kidston-lake']).toMatchObject({ state: 'open', basis: 'verified' })
    expect(july24['hrm-albro-lake'].note).toContain('Heavy Rainfall')
    expect(HRM.filter((id) => july24[id].state === 'advisory')).toHaveLength(7)
    // A provincial beach on a table day is still only inferred: the tables are HRM's.
    expect(july24['ns-rissers']).toMatchObject({ state: 'open', basis: 'inferred' })
  })

  it('carries an advisory between the tables and one sampling week after, then lets it go', () => {
    expect(SEED_DAYS['2026-07-10']['hrm-kearney-lake']).toMatchObject({ state: 'advisory', basis: 'inferred' })
    expect(SEED_DAYS['2026-07-10']['hrm-kidston-lake']).toMatchObject({ state: 'open', basis: 'inferred' })
    expect(SEED_DAYS['2026-07-05']['hrm-kidston-lake']).toMatchObject({ state: 'advisory', basis: 'inferred' })
    expect(SEED_DAYS['2026-07-31']['hrm-kearney-lake']).toMatchObject({ state: 'advisory', basis: 'inferred' })
    expect(SEED_DAYS['2026-08-01']['hrm-kearney-lake']).toMatchObject({ state: 'open', basis: 'inferred' })
    expect(SEED_DAYS['2026-07-28']['hrm-kinap']).toMatchObject({ state: 'advisory', basis: 'inferred' })
    expect(SEED_DAYS['2026-07-29']['hrm-kinap']).toMatchObject({ state: 'open', basis: 'inferred' })
  })

  it('carries the dated notices: Oakfield, Kearney Lake, Sandy Lake, Kinap, and the two salt beaches', () => {
    expect(SEED_DAYS['2026-07-27']['hrm-oakfield-park'].state).toBe('open')
    expect(SEED_DAYS['2026-07-28']['hrm-oakfield-park']).toMatchObject({ state: 'closed', basis: 'verified' })
    expect(SEED_DAYS['2026-08-14']['hrm-oakfield-park']).toMatchObject({ state: 'closed', basis: 'inferred' })
    expect(SEED_DAYS['2026-08-24']['hrm-oakfield-park']).toMatchObject({ state: 'open', basis: 'verified' })
    expect(SEED_DAYS['2026-08-25']['hrm-kearney-lake']).toMatchObject({ state: 'closed', basis: 'verified' })
    expect(SEED_DAYS['2026-08-31']['hrm-kearney-lake']).toMatchObject({ state: 'closed', basis: 'inferred' })
    expect(SEED_DAYS['2026-08-26']['hrm-sandy-lake']).toMatchObject({ state: 'closed', basis: 'verified' })
    expect(SEED_DAYS['2026-08-26']['hrm-kinap']).toMatchObject({ state: 'closed', basis: 'verified' })
    expect(SEED_DAYS['2026-08-25']['hrm-kinap'].state).toBe('open')

    for (const id of ['ns-rainbow-haven', 'ns-lawrencetown']) {
      expect(SEED_DAYS['2026-08-13'][id].state).toBe('open')
      expect(SEED_DAYS['2026-08-14'][id]).toMatchObject({ state: 'advisory', basis: 'verified' })
      expect(SEED_DAYS['2026-08-16'][id]).toMatchObject({ state: 'advisory', basis: 'inferred' })
      expect(SEED_DAYS['2026-08-17'][id]).toMatchObject({ state: 'open', basis: 'verified' })
      expect(SEED_DAYS['2026-08-18'][id]).toMatchObject({ state: 'open', basis: 'inferred' })
    }
  })

  it('2026-08-14 reads as it always has: two provincial advisories, the Oakfield closure, the rest open', () => {
    const states = Object.values(SEED_DAYS['2026-08-14']).map((r) => r.state)
    expect(states.filter((s) => s === 'closed')).toHaveLength(1)
    expect(states.filter((s) => s === 'advisory')).toHaveLength(2)
    expect(states.filter((s) => s === 'open')).toHaveLength(32)
  })
})
