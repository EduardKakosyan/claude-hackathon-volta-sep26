import { describe, expect, it } from 'vitest'
import { formatFlagLine, formatFlagTitle, selectFlags } from './flags'
import type { ReportFlagRow } from './types'

function row(overrides: Partial<ReportFlagRow> = {}): ReportFlagRow {
  return { beach_id: 'hrm-kinap', sign: 'closed', people: 2, last_at: '2026-08-14T16:00:00Z', ...overrides }
}

describe('selectFlags', () => {
  it('returns an empty record for no rows', () => {
    expect(selectFlags([])).toEqual({})
  })

  it('maps a single row', () => {
    const result = selectFlags([row()])
    expect(result).toEqual({
      'hrm-kinap': { beachId: 'hrm-kinap', sign: 'closed', people: 2, lastAt: '2026-08-14T16:00:00Z' },
    })
  })

  it('prefers higher severity when people counts tie', () => {
    const result = selectFlags([
      row({ sign: 'clear', people: 2, last_at: '2026-08-14T16:00:00Z' }),
      row({ sign: 'closed', people: 2, last_at: '2026-08-14T16:00:00Z' }),
    ])
    expect(result['hrm-kinap'].sign).toBe('closed')
  })

  it('prefers more people over higher severity', () => {
    const result = selectFlags([
      row({ sign: 'clear', people: 3, last_at: '2026-08-14T16:00:00Z' }),
      row({ sign: 'closed', people: 2, last_at: '2026-08-14T16:00:00Z' }),
    ])
    expect(result['hrm-kinap'].sign).toBe('clear')
  })

  it('prefers the most recent when people and severity tie', () => {
    const result = selectFlags([
      row({ sign: 'closed', people: 2, last_at: '2026-08-14T10:00:00Z' }),
      row({ sign: 'closed', people: 2, last_at: '2026-08-14T16:00:00Z' }),
    ])
    expect(result['hrm-kinap'].lastAt).toBe('2026-08-14T16:00:00Z')
  })

  it('drops a row with an unknown sign', () => {
    expect(selectFlags([row({ sign: 'weird' })])).toEqual({})
  })

  it('drops a row with fewer than two people', () => {
    expect(selectFlags([row({ people: 1 })])).toEqual({})
  })

  it('drops a row with an unparsable date', () => {
    expect(selectFlags([row({ last_at: 'not-a-date' })])).toEqual({})
  })
})

describe('formatFlagLine', () => {
  it('formats the time in Halifax and includes the title sentence', () => {
    const line = formatFlagLine({ beachId: 'hrm-kinap', sign: 'closed', people: 2, lastAt: '2026-08-14T16:15:00Z' })
    expect(line).toContain('1:15 p.m.')
    expect(line).toContain('2 people reported a Closed sign here today')
  })
})

describe('formatFlagTitle', () => {
  it('uses singular "person" when forced to one', () => {
    expect(formatFlagTitle({ beachId: 'hrm-kinap', sign: 'closed', people: 1, lastAt: '2026-08-14T16:15:00Z' }))
      .toBe('1 person reported a Closed sign here today')
  })
})
