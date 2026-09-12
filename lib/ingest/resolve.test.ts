import { describe, expect, it } from 'vitest'

import { BEACHES } from '@/lib/seed/beaches'
import type { SourceId, SourceReading } from '@/lib/ingest/types'

import { resolve } from './resolve'

function r(over: Partial<SourceReading>): SourceReading {
  return {
    beachId: 'hrm-kinap',
    source: 'hrm',
    kind: 'open',
    verbatim: 'Open',
    url: 'https://example.com',
    ...over,
  }
}

function ok(...ids: SourceId[]): Set<SourceId> {
  return new Set(ids)
}

const SEP = { today: '2026-09-12', now: '2026-09-12T12:40:00.000Z' }
const JUL = { today: '2026-07-15', now: '2026-07-15T12:40:00.000Z' }

describe('resolve', () => {
  it('algae beats HRM open', () => {
    const { statuses } = resolve({
      roster: BEACHES,
      readings: [
        r({ beachId: 'hrm-kinap', source: 'hrm', kind: 'open', verbatim: 'Open' }),
        r({
          beachId: 'hrm-kinap',
          source: 'algae',
          kind: 'closed',
          verbatim: 'Porters Lake — Bloom',
          observedOn: '2026-08-20',
        }),
      ],
      ok: ok('hrm', 'parks', 'algae'),
      ...SEP,
    })
    const kinap = statuses.find((s) => s.beachId === 'hrm-kinap')!
    expect(kinap.state).toBe('closed')
    expect(kinap.source).toBe('algae')
    expect(kinap.verbatim).toBe('Porters Lake — Bloom')
  })

  it('algae beats parks', () => {
    const { statuses } = resolve({
      roster: BEACHES,
      readings: [
        r({ beachId: 'ns-dollar-lake', source: 'parks', kind: 'advisory', verbatim: 'Swimming advisory' }),
        r({ beachId: 'ns-dollar-lake', source: 'algae', kind: 'closed', verbatim: 'Dollar Lake — Bloom', observedOn: '2026-08-01' }),
      ],
      ok: ok('hrm', 'parks', 'algae'),
      ...SEP,
    })
    const dollar = statuses.find((s) => s.beachId === 'ns-dollar-lake')!
    expect(dollar.state).toBe('closed')
    expect(dollar.source).toBe('algae')
  })

  it('algae outside the calendar year is dropped', () => {
    const { statuses } = resolve({
      roster: BEACHES,
      readings: [
        r({ beachId: 'hrm-kearney-lake', source: 'hrm', kind: 'open', verbatim: 'Open' }),
        r({ beachId: 'hrm-kearney-lake', source: 'algae', kind: 'closed', observedOn: '2025-08-01' }),
      ],
      ok: ok('hrm', 'parks', 'algae'),
      ...SEP,
    })
    const kearney = statuses.find((s) => s.beachId === 'hrm-kearney-lake')!
    expect(kearney.state).toBe('open')
    expect(kearney.source).toBe('hrm')
  })

  it('rolling window: within days closes, outside does not', () => {
    const within = resolve({
      roster: BEACHES,
      readings: [
        r({ beachId: 'hrm-kearney-lake', source: 'hrm', kind: 'open' }),
        r({ beachId: 'hrm-kearney-lake', source: 'algae', kind: 'closed', observedOn: '2026-08-20' }),
      ],
      ok: ok('hrm', 'parks', 'algae'),
      today: '2026-09-12',
      now: '2026-09-12T12:40:00.000Z',
      algaeWindow: { kind: 'rolling-days', days: 45 },
    })
    expect(within.statuses.find((s) => s.beachId === 'hrm-kearney-lake')!.state).toBe('closed')

    const outside = resolve({
      roster: BEACHES,
      readings: [
        r({ beachId: 'hrm-kearney-lake', source: 'hrm', kind: 'open' }),
        r({ beachId: 'hrm-kearney-lake', source: 'algae', kind: 'closed', observedOn: '2026-07-01' }),
      ],
      ok: ok('hrm', 'parks', 'algae'),
      today: '2026-09-12',
      now: '2026-09-12T12:40:00.000Z',
      algaeWindow: { kind: 'rolling-days', days: 45 },
    })
    expect(outside.statuses.find((s) => s.beachId === 'hrm-kearney-lake')!.state).toBe('open')
  })

  it('maps all four HRM words, sourced hrm, confirmedAt === now', () => {
    const readings = [
      r({ beachId: 'hrm-albro-lake', kind: 'open', verbatim: 'Open' }),
      r({ beachId: 'hrm-birch-cove', kind: 'advisory', verbatim: 'Risk Advisory in Effect' }),
      r({ beachId: 'hrm-oakfield-park', kind: 'closed', verbatim: 'Closed' }),
      r({ beachId: 'hrm-kidston-lake', kind: 'offseason', verbatim: 'Supervision ended for the season' }),
    ]
    const { statuses } = resolve({ roster: BEACHES, readings, ok: ok('hrm', 'parks', 'algae'), ...SEP })
    for (const beachId of ['hrm-albro-lake', 'hrm-birch-cove', 'hrm-oakfield-park', 'hrm-kidston-lake']) {
      const s = statuses.find((x) => x.beachId === beachId)!
      expect(s.source).toBe('hrm')
      expect(s.confirmedAt).toBe(SEP.now)
    }
  })

  it('HRM beach missing from a successful read is omitted, not open', () => {
    const { statuses, omitted } = resolve({
      roster: BEACHES,
      readings: [],
      ok: ok('hrm', 'parks', 'algae'),
      ...SEP,
    })
    expect(statuses.some((s) => s.beachId === 'hrm-kinap')).toBe(false)
    expect(omitted).toContainEqual({ beachId: 'hrm-kinap', reason: 'no-hrm-row' })
  })

  it('HRM failed, no algae: all 18 HRM beaches omitted source-failed; provincial still resolve', () => {
    const { statuses, omitted } = resolve({
      roster: BEACHES,
      readings: [],
      ok: ok('parks', 'algae'),
      ...SEP,
    })
    const hrmIds = BEACHES.filter((b) => b.authority === 'hrm').map((b) => b.id)
    for (const id of hrmIds) {
      expect(omitted).toContainEqual({ beachId: id, reason: 'source-failed' })
    }
    const provincialIds = BEACHES.filter((b) => b.authority === 'province').map((b) => b.id)
    expect(statuses.filter((s) => provincialIds.includes(s.beachId))).toHaveLength(provincialIds.length)
  })

  it('HRM failed, algae positive for one HRM beach: that beach emits closed/algae, rest omitted', () => {
    const { statuses, omitted } = resolve({
      roster: BEACHES,
      readings: [
        r({ beachId: 'hrm-kinap', source: 'algae', kind: 'closed', verbatim: 'Porters Lake — Bloom', observedOn: '2026-08-20' }),
      ],
      ok: ok('parks', 'algae'),
      ...SEP,
    })
    const kinap = statuses.find((s) => s.beachId === 'hrm-kinap')!
    expect(kinap.state).toBe('closed')
    expect(kinap.source).toBe('algae')
    const otherHrmIds = BEACHES.filter((b) => b.authority === 'hrm' && b.id !== 'hrm-kinap').map((b) => b.id)
    for (const id of otherHrmIds) {
      expect(omitted).toContainEqual({ beachId: id, reason: 'source-failed' })
    }
  })

  it('parks closed beats parks advisory', () => {
    const { statuses } = resolve({
      roster: BEACHES,
      readings: [
        r({ beachId: 'ns-rainbow-haven', source: 'parks', kind: 'advisory', verbatim: 'Advisory text' }),
        r({ beachId: 'ns-rainbow-haven', source: 'parks', kind: 'closed', verbatim: 'Closed text' }),
      ],
      ok: ok('hrm', 'parks', 'algae'),
      ...SEP,
    })
    const rainbow = statuses.find((s) => s.beachId === 'ns-rainbow-haven')!
    expect(rainbow.state).toBe('closed')
  })

  it('province in season, no readings: open/season', () => {
    const { statuses } = resolve({ roster: BEACHES, readings: [], ok: ok('hrm', 'parks', 'algae'), ...JUL })
    const rissers = statuses.find((s) => s.beachId === 'ns-rissers')!
    expect(rissers.state).toBe('open')
    expect(rissers.source).toBe('season')
    expect(rissers.verbatim).toBe('No advisory posted')
  })

  it('province off season, no readings: offseason/season', () => {
    const { statuses } = resolve({ roster: BEACHES, readings: [], ok: ok('hrm', 'parks', 'algae'), ...SEP })
    const rissers = statuses.find((s) => s.beachId === 'ns-rissers')!
    expect(rissers.state).toBe('offseason')
    expect(rissers.source).toBe('season')
  })

  it('province when parks failed but algae ok, no readings: all provincial omitted', () => {
    const { statuses, omitted } = resolve({ roster: BEACHES, readings: [], ok: ok('hrm', 'algae'), ...SEP })
    const provincialIds = BEACHES.filter((b) => b.authority === 'province').map((b) => b.id)
    for (const id of provincialIds) {
      expect(omitted).toContainEqual({ beachId: id, reason: 'source-failed' })
    }
    expect(statuses.some((s) => provincialIds.includes(s.beachId))).toBe(false)
  })

  it('province when algae failed but parks positive: that beach still emits closed/parks', () => {
    const { statuses, omitted } = resolve({
      roster: BEACHES,
      readings: [r({ beachId: 'ns-rainbow-haven', source: 'parks', kind: 'closed', verbatim: 'Closed for construction' })],
      ok: ok('hrm', 'parks'),
      ...SEP,
    })
    const rainbow = statuses.find((s) => s.beachId === 'ns-rainbow-haven')!
    expect(rainbow.state).toBe('closed')
    expect(rainbow.source).toBe('parks')
    const otherProvincial = BEACHES.filter((b) => b.authority === 'province' && b.id !== 'ns-rainbow-haven').map(
      (b) => b.id,
    )
    for (const id of otherProvincial) {
      expect(omitted).toContainEqual({ beachId: id, reason: 'source-failed' })
    }
  })

  it('readings from a failed source are ignored entirely', () => {
    const { statuses, omitted } = resolve({
      roster: BEACHES,
      readings: [r({ beachId: 'ns-rainbow-haven', source: 'parks', kind: 'closed', verbatim: 'Closed' })],
      ok: ok('hrm'),
      ...SEP,
    })
    expect(statuses.some((s) => s.beachId === 'ns-rainbow-haven')).toBe(false)
    expect(omitted).toContainEqual({ beachId: 'ns-rainbow-haven', reason: 'source-failed' })
  })

  it('never produces an unknown state, and every beach is accounted for', () => {
    const { statuses, omitted } = resolve({ roster: BEACHES, readings: [], ok: ok('hrm', 'parks', 'algae'), ...SEP })
    const validStates = new Set(['open', 'advisory', 'closed', 'offseason'])
    for (const s of statuses) expect(validStates.has(s.state)).toBe(true)
    expect(statuses.length + omitted.length).toBe(BEACHES.length)
  })

  it('duplicate HRM rows keep the most severe', () => {
    const { statuses } = resolve({
      roster: BEACHES,
      readings: [
        r({ beachId: 'hrm-kinap', source: 'hrm', kind: 'open', verbatim: 'Open' }),
        r({ beachId: 'hrm-kinap', source: 'hrm', kind: 'closed', verbatim: 'Closed' }),
      ],
      ok: ok('hrm', 'parks', 'algae'),
      ...SEP,
    })
    expect(statuses.find((s) => s.beachId === 'hrm-kinap')!.state).toBe('closed')
  })

  it('emits kind: live and no basis/note fields on every LiveStatus', () => {
    const { statuses } = resolve({ roster: BEACHES, readings: [], ok: ok('hrm', 'parks', 'algae'), ...SEP })
    for (const s of statuses) {
      expect(s.kind).toBe('live')
    }
  })
})
