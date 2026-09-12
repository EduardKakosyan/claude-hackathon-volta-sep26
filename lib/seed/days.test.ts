import { describe, expect, it } from 'vitest'

import { BEACHES, BEACHES_BY_ID } from './beaches'
import { SEED_DAYS } from './days'

const STATES = new Set(['open', 'advisory', 'closed', 'offseason'])

describe('seeded replay days', () => {
  it('keys every day as YYYY-MM-DD', () => {
    for (const day of Object.keys(SEED_DAYS)) {
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('covers every roster id, and nothing else, with a valid state', () => {
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

  it('never claims verification for an open pin, only for a posted notice', () => {
    // An "open" replay row can only ever be the absence of a notice, which no
    // article records. Verified rows must be advisories or closures.
    for (const rows of Object.values(SEED_DAYS)) {
      for (const [id, row] of Object.entries(rows)) {
        if (row.basis === 'verified') {
          expect(row.state, id).not.toBe('open')
        }
      }
    }
  })

  it('2026-08-14 carries the two provincial advisories and the Oakfield closure', () => {
    const day = SEED_DAYS['2026-08-14']
    expect(day['ns-rainbow-haven']).toMatchObject({ state: 'advisory', basis: 'verified' })
    expect(day['ns-lawrencetown']).toMatchObject({ state: 'advisory', basis: 'verified' })
    expect(day['hrm-oakfield-park']).toMatchObject({ state: 'closed', basis: 'inferred' })
  })
})
