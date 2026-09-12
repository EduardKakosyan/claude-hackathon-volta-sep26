import type { Beach, BeachState } from '@/lib/seed/beaches'

// Shared DTOs are owned by lib/status.ts (Phase 2); re-exported here so ingest
// code has one import path without redeclaring shapes that must stay in sync
// with the DB schema and the components that render them.
export type {
  LiveStatus,
  StatusSource,
  IngestSource,
  StatusDayView,
  DayBasis,
  SourceHealthView,
} from '@/lib/status'
import type { IngestSource } from '@/lib/status'

/** The three things we read. Alias of Phase 2's IngestSource. */
export type SourceId = IngestSource
export const SOURCE_IDS: readonly SourceId[] = ['hrm', 'parks', 'algae']

/** ISO 8601 instant with offset or Z, e.g. '2026-09-12T12:40:03.000Z'. Serialisable; never a Date. */
export type IsoInstant = string
/** 'YYYY-MM-DD' calendar day. Halifax-local unless stated otherwise. */
export type CalendarDay = string

/** What one source said about one beach. Parsers emit these; they never carry a resolved state. */
export interface SourceReading {
  beachId: string
  source: SourceId
  /** The source's own claim, mapped 1:1 (HRM words), by title keyword (parks), or always 'closed' (algae). */
  kind: BeachState
  /** Exact words shown on the detail sheet: HRM cell text, card title, or "<lake> — <bloom-details>". */
  verbatim: string
  /** Absolute URL of the page/entry the reading came from. */
  url: string
  /** Instant the source says it posted this, when it publishes one (algae <published>). */
  postedAt?: IsoInstant
  /** Local calendar day the source attaches to the notice (algae <date>). Drives the validity window. */
  observedOn?: CalendarDay
}

export interface SourceAttempt {
  source: SourceId
  attemptedAt: IsoInstant
  ok: boolean
  /** Truncated to 500 chars. null when ok. */
  error: string | null
}

export type AnomalyCode =
  | 'unknown-hrm-word' // HRM cell text outside the four known values → row skipped
  | 'unmatched-hrm-row' // HRM row whose name matches no roster hrmTable → row skipped
  | 'hrm-beach-missing' // roster HRM beach absent from a successful HRM read → beach omitted
  | 'malformed-entry' // card/entry missing title, href, lake, or date → skipped

export interface IngestAnomaly {
  source: SourceId
  code: AnomalyCode
  detail: string
}

export interface ParseResult {
  readings: SourceReading[]
  anomalies: IngestAnomaly[]
}

export type Roster = readonly Beach[]
