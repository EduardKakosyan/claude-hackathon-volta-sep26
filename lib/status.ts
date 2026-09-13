import type { BeachState } from '@/lib/seed/beaches'

/** Who a live status came from. `season` is the resolver's "no notice, in/out of season" fallback. */
export type StatusSource = 'hrm' | 'parks' | 'algae' | 'season'

/** The three government sources the status resolver reads. */
export type StatusIngestSource = 'hrm' | 'parks' | 'algae'

/** The two conditions feeds: Open-Meteo wind and the SmartAtlantic Halifax buoy. */
export type ConditionsSource = 'wind' | 'buoy'

/** Everything the hourly refresh reads; one `source_health` row each. */
export type IngestSource = StatusIngestSource | ConditionsSource

/**
 * A live status row: one per beach, written only by a real read of a source.
 * Every field is serialisable so the server can hand it to the client as props.
 */
export interface LiveStatus {
  kind: 'live'
  beachId: string
  state: BeachState
  source: StatusSource
  verbatim: string | null
  sourceUrl: string
  /** ISO timestamp the source itself posted, when it has one. */
  postedAt: string | null
  /** ISO timestamp of the last successful read that produced this row. */
  confirmedAt: string
}

/**
 * Where a `status_day` row came from. `scraped` rows are written by the
 * ingest; the seed writes the other three: `verified` from a dated notice or
 * an archived table, `inferred` between such evidence, and `calendar` for a
 * day outside the authority's published supervision window.
 */
export type DayBasis = 'scraped' | 'verified' | 'inferred' | 'calendar'

/** One beach on one Halifax calendar day. Carries a state, never provenance. */
export interface StatusDayView {
  beachId: string
  day: string
  state: BeachState
  basis: DayBasis
  note: string | null
}

/** One recorded day and how many beaches stood in each state: the day scrubber's chips. */
export interface DaySummary {
  day: string
  open: number
  advisory: number
  closed: number
  offseason: number
}

/** A replayed status: the `status_day` row for the requested day. */
export interface ReplayStatus extends StatusDayView {
  kind: 'replay'
}

export type StatusView = LiveStatus | ReplayStatus

export interface SourceHealthView {
  source: IngestSource
  lastAttemptAt: string
  lastSuccessAt: string | null
  lastError: string | null
}

export function toReplay(row: StatusDayView): ReplayStatus {
  return { kind: 'replay', ...row }
}
