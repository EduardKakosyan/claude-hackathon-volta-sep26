import type { BeachState } from '@/lib/seed/beaches'
import { daysBetween } from '@/lib/ingest/halifax-day'
import type { CalendarDay, IsoInstant, LiveStatus, Roster, SourceId, SourceReading } from '@/lib/ingest/types'
import { inSeason } from '@/lib/season'

export type AlgaeWindow =
  | { kind: 'calendar-year' } // DEFAULT: matches novascotia.ca's own "reported in 2026" page
  | { kind: 'rolling-days'; days: number } // alternative: a May bloom does not close Kinap in August

export const DEFAULT_ALGAE_WINDOW: AlgaeWindow = { kind: 'calendar-year' }

export interface ResolveInput {
  roster: Roster
  readings: readonly SourceReading[]
  /** Sources whose fetch AND parse succeeded this run. */
  ok: ReadonlySet<SourceId>
  today: CalendarDay // Halifax calendar day
  now: IsoInstant // becomes confirmedAt on every emitted row
  algaeWindow?: AlgaeWindow
}

export type OmitReason = 'source-failed' | 'no-hrm-row'

export interface ResolveResult {
  statuses: LiveStatus[]
  omitted: { beachId: string; reason: OmitReason }[]
}

const HRM_SEVERITY: Readonly<Record<BeachState, number>> = {
  closed: 3,
  advisory: 2,
  offseason: 1,
  open: 0,
}

function inAlgaeWindow(observedOn: CalendarDay | undefined, today: CalendarDay, window: AlgaeWindow): boolean {
  if (!observedOn) return false
  if (window.kind === 'calendar-year') return observedOn.slice(0, 4) === today.slice(0, 4)
  const delta = daysBetween(observedOn, today)
  return delta >= 0 && delta <= window.days
}

export function resolve(input: ResolveInput): ResolveResult {
  const { roster, readings, ok, today, now } = input
  const algaeWindow = input.algaeWindow ?? DEFAULT_ALGAE_WINDOW

  const byBeach = new Map<string, SourceReading[]>()
  for (const r of readings) {
    if (!ok.has(r.source)) continue // readings from a failed source are never applied
    const list = byBeach.get(r.beachId)
    if (list) list.push(r)
    else byBeach.set(r.beachId, [r])
  }

  const statuses: LiveStatus[] = []
  const omitted: { beachId: string; reason: OmitReason }[] = []

  for (const beach of roster) {
    const readingsForBeach = byBeach.get(beach.id) ?? []

    const algaeReadings = readingsForBeach
      .filter((r) => r.source === 'algae')
      .filter((r) => inAlgaeWindow(r.observedOn, today, algaeWindow))

    if (algaeReadings.length > 0) {
      const best = algaeReadings.reduce((a, b) => ((b.observedOn ?? '') > (a.observedOn ?? '') ? b : a))
      statuses.push({
        kind: 'live',
        beachId: beach.id,
        state: 'closed',
        source: 'algae',
        verbatim: best.verbatim,
        sourceUrl: best.url,
        postedAt: best.postedAt ?? null,
        confirmedAt: now,
      })
      continue
    }

    if (beach.authority === 'hrm') {
      const hrmReadings = readingsForBeach.filter((r) => r.source === 'hrm')
      if (hrmReadings.length > 0) {
        const best = hrmReadings.reduce((a, b) => (HRM_SEVERITY[b.kind] > HRM_SEVERITY[a.kind] ? b : a))
        statuses.push({
          kind: 'live',
          beachId: beach.id,
          state: best.kind,
          source: 'hrm',
          verbatim: best.verbatim,
          sourceUrl: best.url,
          postedAt: null,
          confirmedAt: now,
        })
        continue
      }
      omitted.push({ beachId: beach.id, reason: ok.has('hrm') ? 'no-hrm-row' : 'source-failed' })
      continue
    }

    // beach.authority === 'province'
    const parksReadings = readingsForBeach.filter((r) => r.source === 'parks')
    const closedCard = parksReadings.find((r) => r.kind === 'closed')
    if (closedCard) {
      statuses.push({
        kind: 'live',
        beachId: beach.id,
        state: 'closed',
        source: 'parks',
        verbatim: closedCard.verbatim,
        sourceUrl: closedCard.url,
        postedAt: closedCard.postedAt ?? null,
        confirmedAt: now,
      })
      continue
    }
    if (parksReadings.length > 0) {
      const first = parksReadings[0]
      statuses.push({
        kind: 'live',
        beachId: beach.id,
        state: first.kind,
        source: 'parks',
        verbatim: first.verbatim,
        sourceUrl: first.url,
        postedAt: first.postedAt ?? null,
        confirmedAt: now,
      })
      continue
    }

    if (ok.has('parks') && ok.has('algae')) {
      // refreshLive skips the province out of season, so this is `open` in practice;
      // the calendar is still consulted so a caller that reads it anyway stays honest.
      const state: BeachState = inSeason('province', today) ? 'open' : 'offseason'
      statuses.push({
        kind: 'live',
        beachId: beach.id,
        state,
        source: 'season',
        verbatim: 'No advisory posted',
        sourceUrl: beach.sourceUrl,
        postedAt: null,
        confirmedAt: now,
      })
      continue
    }

    omitted.push({ beachId: beach.id, reason: 'source-failed' })
  }

  return { statuses, omitted }
}
