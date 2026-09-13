import { BEACHES, type Authority, type BeachState } from '@/lib/seed/beaches'
import type { PageStore, StatusWriter } from '@/lib/db/store'
import type { LiveStatus, SourceHealthView, StatusDayView, StatusIngestSource as IngestSource } from '@/lib/status'
import { describeError } from '@/lib/ingest/errors'
import { halifaxDay } from '@/lib/ingest/halifax-day'
import { resolve } from '@/lib/ingest/resolve'
import { fetchAlgae, parseAlgae } from '@/lib/ingest/sources/algae'
import { fetchHrm, parseHrm } from '@/lib/ingest/sources/hrm'
import { fetchParks, parseParks } from '@/lib/ingest/sources/parks'
import type { CalendarDay, IngestAnomaly, ParseResult, Roster, SourceReading } from '@/lib/ingest/types'
import { AUTHORITIES, inSeason, offseasonStatus } from '@/lib/season'

/** One source's fetch + parse pair, injectable so tests never touch the network. */
export interface SourceFetcher {
  fetch(): Promise<string>
  parse(raw: string, roster: Roster): ParseResult
}

const DEFAULT_FETCHERS: Readonly<Record<IngestSource, SourceFetcher>> = {
  hrm: { fetch: () => fetchHrm(), parse: parseHrm },
  parks: { fetch: () => fetchParks(), parse: parseParks },
  algae: { fetch: () => fetchAlgae(), parse: parseAlgae },
}

export interface RefreshLiveDeps {
  writer: PageStore & StatusWriter
  fetchers?: Partial<Record<IngestSource, SourceFetcher>>
  now?: () => Date
  roster?: Roster
  log?: (message: string, detail?: unknown) => void
}

export interface SourceOutcome {
  source: IngestSource
  ok: boolean
  error: string | null
  readingCount: number
  anomalies: IngestAnomaly[]
}

/**
 * A beach whose `state` this run wrote differently from the row before it.
 * `from` is null for a beach that had no row at all. The row itself rides
 * along so the notification can quote it without a second read.
 */
export interface StatusTransition {
  beachId: string
  from: BeachState | null
  to: BeachState
  status: LiveStatus
}

export interface IngestResult {
  attemptedAt: string
  today: string
  /** Only the sources that were read: an out-of-season source records no attempt. */
  sources: SourceOutcome[]
  /** The authorities written as off-season this run, without a fetch. */
  offseason: Authority[]
  written: number
  omitted: number
  /**
   * Every beach whose state changed against the rows that were there before
   * the write. Unchanged status, a re-confirmation, a source outage (the row
   * is kept, not rewritten) and conditions never appear here: this is exactly
   * what the followers are told about.
   */
  transitions: StatusTransition[]
}

/** The diff the followers are told about: state to state, per beach, in roster order. */
export function diffTransitions(previous: readonly LiveStatus[], next: readonly LiveStatus[]): StatusTransition[] {
  const before = new Map(previous.map((row) => [row.beachId, row.state]))
  const out: StatusTransition[] = []
  for (const status of next) {
    const from = before.get(status.beachId) ?? null
    if (from === status.state) continue
    out.push({ beachId: status.beachId, from, to: status.state, status })
  }
  return out
}

/**
 * Which sources a day's refresh reads. HRM's table is HRM's season; the parks
 * advisories are the province's. The algae feed attributes a notice to any
 * beach on the named lake, HRM lakes included, so it is read whenever any
 * beach is in season — a bloom on an HRM lake in the last days of June must
 * close that beach even though the province has not opened yet.
 */
export function activeSources(today: CalendarDay): IngestSource[] {
  const hrm = inSeason('hrm', today)
  const province = inSeason('province', today)
  const active: IngestSource[] = []
  if (hrm) active.push('hrm')
  if (province) active.push('parks')
  if (hrm || province) active.push('algae')
  return active
}

/**
 * Reads the government sources whose authority is in season, concurrently,
 * resolves every in-season roster beach it can attribute, and upserts only what
 * it read: live status, today's status_day row, and source_health. A failed
 * source leaves its beaches' existing rows untouched — `resolve()` already
 * excludes readings from sources not in `ok`.
 *
 * Out of season nothing is fetched for that authority: every one of its beaches
 * is written as `offseason` from source `season` (lib/season.ts), so the page
 * leads with conditions instead of reading a stale in-season row as today's,
 * and no `unknown` can look like an outage. The skipped source records no
 * attempt, so its health row keeps the last in-season read.
 */
export async function refreshLive(deps: RefreshLiveDeps): Promise<IngestResult> {
  const { writer, roster = BEACHES, log } = deps
  const now = deps.now?.() ?? new Date()
  const nowIso = now.toISOString()
  const today = halifaxDay(now)
  const fetchers = { ...DEFAULT_FETCHERS, ...deps.fetchers }

  const readings: SourceReading[] = []
  const ok = new Set<IngestSource>()
  const outcomes: SourceOutcome[] = []

  const sources = activeSources(today)
  await Promise.all(
    sources.map(async (source) => {
      const { fetch: doFetch, parse } = fetchers[source]!
      try {
        const raw = await doFetch()
        const { readings: parsed, anomalies } = parse(raw, roster)
        readings.push(...parsed)
        ok.add(source)
        outcomes.push({ source, ok: true, error: null, readingCount: parsed.length, anomalies })
        if (anomalies.length) log?.(`${source}: ${anomalies.length} anomalies`, anomalies)
      } catch (err) {
        const error = describeError(err)
        outcomes.push({ source, ok: false, error, readingCount: 0, anomalies: [] })
        log?.(`${source} failed: ${error}`)
      }
    }),
  )

  const offseason = AUTHORITIES.filter((authority) => !inSeason(authority, today))
  const inSeasonRoster = roster.filter((beach) => inSeason(beach.authority, today))
  const resolved = resolve({ roster: inSeasonRoster, readings, ok, today, now: nowIso })
  const resolvedById = new Map(resolved.statuses.map((s) => [s.beachId, s]))

  // Roster order: an in-season beach carries what its source said (or nothing,
  // and stays omitted); an out-of-season beach carries the calendar's row.
  const statuses: LiveStatus[] = []
  for (const beach of roster) {
    if (!inSeason(beach.authority, today)) statuses.push(offseasonStatus(beach, nowIso))
    else {
      const row = resolvedById.get(beach.id)
      if (row) statuses.push(row)
    }
  }

  const dayRows: StatusDayView[] = statuses.map((s) => ({
    beachId: s.beachId,
    day: today,
    state: s.state,
    basis: 'scraped',
    note: null,
  }))

  // Read before the write: the diff against these rows is what the followers
  // are told about, and a beach a failed source left alone is not in `statuses`,
  // so it can never read as a change.
  const [existingHealth, previous] = await Promise.all([writer.health(), writer.liveStatus()])
  const transitions = diffTransitions(previous, statuses)
  const healthBySource = new Map(existingHealth.map((h) => [h.source, h]))
  const mergedHealth: SourceHealthView[] = outcomes.map(({ source, ok: succeeded, error }) => {
    const prev = healthBySource.get(source)
    return {
      source,
      lastAttemptAt: nowIso,
      lastSuccessAt: succeeded ? nowIso : (prev?.lastSuccessAt ?? null),
      lastError: succeeded ? null : error,
    }
  })

  const written = await writer.upsertLiveStatus(statuses)
  await writer.upsertStatusDays(dayRows)
  await writer.upsertSourceHealth(mergedHealth)

  return { attemptedAt: nowIso, today, sources: outcomes, offseason, written, omitted: resolved.omitted.length, transitions }
}
