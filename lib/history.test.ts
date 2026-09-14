import { describe, expect, it } from 'vitest'

import type { StatusDayView } from '@/lib/status'

import { seasonOf, spanFor, toSpans } from './history'

const row = (day: string, state: StatusDayView['state'], basis: StatusDayView['basis'] = 'inferred', note: string | null = 'n'): StatusDayView => ({
  beachId: 'hrm-oakfield-park',
  day,
  state,
  basis,
  note,
})

describe('toSpans', () => {
  it('folds consecutive days with the same state, basis and note into one span, in day order', () => {
    const spans = toSpans([
      row('2026-07-03', 'open'),
      row('2026-07-01', 'open'),
      row('2026-07-02', 'open'),
      row('2026-07-04', 'closed', 'verified', 'notice'),
      row('2026-07-05', 'closed', 'inferred', 'between'),
      row('2026-07-06', 'closed', 'inferred', 'between'),
    ])
    expect(spans).toEqual([
      { from: '2026-07-01', to: '2026-07-03', state: 'open', basis: 'inferred', note: 'n' },
      { from: '2026-07-04', to: '2026-07-04', state: 'closed', basis: 'verified', note: 'notice' },
      { from: '2026-07-05', to: '2026-07-06', state: 'closed', basis: 'inferred', note: 'between' },
    ])
  })

  it('breaks a span on a missing day rather than painting the gap', () => {
    const spans = toSpans([row('2026-07-01', 'open'), row('2026-07-03', 'open')])
    expect(spans).toEqual([
      { from: '2026-07-01', to: '2026-07-01', state: 'open', basis: 'inferred', note: 'n' },
      { from: '2026-07-03', to: '2026-07-03', state: 'open', basis: 'inferred', note: 'n' },
    ])
  })

  it('keeps one row per day: a duplicate day does not extend the span', () => {
    const spans = toSpans([row('2026-07-01', 'open'), row('2026-07-01', 'closed')])
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ from: '2026-07-01', to: '2026-07-01' })
  })

  it('is empty for no rows', () => {
    expect(toSpans([])).toEqual([])
  })
})

describe('spanFor', () => {
  const spans = toSpans([row('2026-07-01', 'open'), row('2026-07-02', 'open'), row('2026-07-04', 'closed')])
  it('finds the span a day falls in and nothing for a day outside every span', () => {
    expect(spanFor(spans, '2026-07-02')?.state).toBe('open')
    expect(spanFor(spans, '2026-07-04')?.state).toBe('closed')
    expect(spanFor(spans, '2026-07-03')).toBeUndefined()
    expect(spanFor(spans, '2026-06-30')).toBeUndefined()
  })
})

describe('seasonOf', () => {
  it('bounds the season by the non-offseason days and counts each state by day', () => {
    const season = seasonOf([
      { from: '2026-01-01', to: '2026-06-30', state: 'offseason', basis: 'calendar', note: null },
      { from: '2026-07-01', to: '2026-07-27', state: 'open', basis: 'inferred', note: null },
      { from: '2026-07-28', to: '2026-08-23', state: 'closed', basis: 'inferred', note: null },
      { from: '2026-08-24', to: '2026-08-29', state: 'open', basis: 'inferred', note: null },
      { from: '2026-08-30', to: '2026-08-31', state: 'advisory', basis: 'inferred', note: null },
      { from: '2026-09-01', to: '2026-09-13', state: 'offseason', basis: 'calendar', note: null },
    ])
    expect(season).toEqual({ from: '2026-07-01', to: '2026-08-31', open: 27 + 6, advisory: 2, closed: 27 })
  })

  it('has no bounds when every day was off-season', () => {
    expect(seasonOf([{ from: '2026-01-01', to: '2026-03-01', state: 'offseason', basis: 'calendar', note: null }])).toEqual({
      from: null,
      to: null,
      open: 0,
      advisory: 0,
      closed: 0,
    })
  })
})
