import { BEACHES } from '@/lib/seed/beaches'
import type { PageStore, StatusWriter } from '@/lib/db/store'
import type { SourceHealthView, StatusDayView, StatusIngestSource as IngestSource } from '@/lib/status'
import { describeError } from '@/lib/ingest/errors'
import { halifaxDay } from '@/lib/ingest/halifax-day'
import { resolve } from '@/lib/ingest/resolve'
import { fetchAlgae, parseAlgae } from '@/lib/ingest/sources/algae'
import { fetchHrm, parseHrm } from '@/lib/ingest/sources/hrm'
import { fetchParks, parseParks } from '@/lib/ingest/sources/parks'
import type { IngestAnomaly, ParseResult, Roster, SourceReading } from '@/lib/ingest/types'

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

export interface IngestResult {
  attemptedAt: string
  today: string
  sources: SourceOutcome[]
  written: number
  omitted: number
}

/**
 * Reads the three government sources concurrently, resolves every roster beach it
 * can attribute, and upserts only what it read: live status, today's status_day
 * row, and source_health. A failed source leaves its beaches' existing rows
 * untouched — `resolve()` already excludes readings from sources not in `ok`.
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

  const sources: IngestSource[] = ['hrm', 'parks', 'algae']
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

  const { statuses, omitted } = resolve({ roster, readings, ok, today, now: nowIso })

  const dayRows: StatusDayView[] = statuses.map((s) => ({
    beachId: s.beachId,
    day: today,
    state: s.state,
    basis: 'scraped',
    note: null,
  }))

  const existingHealth = await writer.health()
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

  return { attemptedAt: nowIso, today, sources: outcomes, written, omitted: omitted.length }
}
