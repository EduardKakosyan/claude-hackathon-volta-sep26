import type { BeachState } from '@/lib/seed/beaches'
import type { DayBasis, StatusDayView } from '@/lib/status'

/**
 * A run of consecutive days on which one beach stood in the same state for
 * the same reason. The seed is written this way; scraped days collapse into
 * it by state. A season is a dozen of these where it would be 256 rows, each
 * carrying a long note.
 */
export interface HistorySpan {
  from: string
  to: string
  state: BeachState
  basis: DayBasis
  note: string | null
}

/** What /api/history/:beachId answers, and what the timeline draws. */
export interface BeachHistory {
  beachId: string
  /** The first and last recorded day, inclusive; both empty when nothing is recorded. */
  from: string
  to: string
  spans: HistorySpan[]
}

/** The in-season shape of a history: its bounds and how the days went. */
export interface Season {
  /** The first and last day not off-season, or null when every day was. */
  from: string | null
  to: string | null
  open: number
  advisory: number
  closed: number
}

const nextDay = (day: string): string => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const dayCount = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1

/**
 * Rows of one beach, any order, into spans in day order. A span breaks on a
 * change of state, basis or note, and on a gap in the calendar: a missing day
 * stays missing rather than being painted with its neighbour's state.
 */
export function toSpans(rows: readonly StatusDayView[]): HistorySpan[] {
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day))
  const out: HistorySpan[] = []
  for (const row of sorted) {
    const last = out[out.length - 1]
    if (
      last &&
      last.state === row.state &&
      last.basis === row.basis &&
      last.note === row.note &&
      nextDay(last.to) === row.day
    ) {
      last.to = row.day
    } else if (!last || row.day > last.to) {
      out.push({ from: row.day, to: row.day, state: row.state, basis: row.basis, note: row.note })
    }
  }
  return out
}

/** The span a day falls in, if any. */
export function spanFor(spans: readonly HistorySpan[], day: string): HistorySpan | undefined {
  return spans.find((s) => day >= s.from && day <= s.to)
}

/** Bounds and counts of the days that were not off-season. */
export function seasonOf(spans: readonly HistorySpan[]): Season {
  const season: Season = { from: null, to: null, open: 0, advisory: 0, closed: 0 }
  for (const s of spans) {
    if (s.state === 'offseason') continue
    season[s.state] += dayCount(s.from, s.to)
    if (season.from === null || s.from < season.from) season.from = s.from
    if (season.to === null || s.to > season.to) season.to = s.to
  }
  return season
}
