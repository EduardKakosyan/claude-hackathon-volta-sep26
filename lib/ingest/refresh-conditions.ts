import type { BuoyReading, ConditionsRow } from '@/lib/conditions'
import type { PageStore, StatusWriter } from '@/lib/db/store'
import { describeError } from '@/lib/ingest/errors'
import { fetchOpenMeteo, parseOpenMeteo } from '@/lib/ingest/sources/open-meteo'
import { fetchBuoy, parseErddap } from '@/lib/ingest/sources/smartatlantic'
import type { Roster } from '@/lib/ingest/types'
import { BEACHES } from '@/lib/seed/beaches'
import type { ConditionsSource, SourceHealthView } from '@/lib/status'

/** The wind feed: one batched call, one row per roster beach. */
export interface WindFetcher {
  fetch(roster: Roster, now: Date): Promise<string>
  parse(raw: string, roster: Roster): ConditionsRow[]
}

/** The buoy feed: one call, one reading — or null when the window held none. */
export interface BuoyFetcher {
  fetch(now: Date): Promise<string>
  parse(raw: string): BuoyReading | null
}

export interface ConditionsFetchers {
  wind: WindFetcher
  buoy: BuoyFetcher
}

const DEFAULT_FETCHERS: ConditionsFetchers = {
  wind: { fetch: (roster) => fetchOpenMeteo(roster), parse: parseOpenMeteo },
  buoy: { fetch: (now) => fetchBuoy({ now }), parse: parseErddap },
}

export interface RefreshConditionsDeps {
  writer: PageStore & StatusWriter
  fetchers?: Partial<ConditionsFetchers>
  now?: () => Date
  roster?: Roster
  log?: (message: string, detail?: unknown) => void
}

export interface ConditionsOutcome {
  source: ConditionsSource
  ok: boolean
  error: string | null
}

export interface ConditionsResult {
  attemptedAt: string
  sources: ConditionsOutcome[]
  /** Wind rows written, and whether a buoy reading was (a healthy read of an empty window writes none). */
  written: { conditions: number; buoy: boolean }
}

/**
 * The third stage of the refresh: wind for every beach and the buoy reading,
 * each fetched, parsed and written inside its own try, so one feed failing
 * leaves the other's rows in place — and nothing here ever throws, so a
 * conditions problem can never touch the status write that ran before it.
 * Health is merged the way status does it: a failure keeps the previous
 * lastSuccessAt and records the error.
 */
export async function refreshConditions(deps: RefreshConditionsDeps): Promise<ConditionsResult> {
  const { writer, roster = BEACHES, log } = deps
  const now = deps.now?.() ?? new Date()
  const nowIso = now.toISOString()
  const fetchers = { ...DEFAULT_FETCHERS, ...deps.fetchers }
  const outcomes: ConditionsOutcome[] = []
  const written = { conditions: 0, buoy: false }

  const attempt = async (source: ConditionsSource, work: () => Promise<void>) => {
    try {
      await work()
      outcomes.push({ source, ok: true, error: null })
    } catch (err) {
      const error = describeError(err)
      outcomes.push({ source, ok: false, error })
      log?.(`${source} failed: ${error}`)
    }
  }

  await Promise.all([
    attempt('wind', async () => {
      const raw = await fetchers.wind.fetch(roster, now)
      const rows = fetchers.wind.parse(raw, roster)
      written.conditions = await writer.upsertConditions(rows)
    }),
    attempt('buoy', async () => {
      const raw = await fetchers.buoy.fetch(now)
      const reading = fetchers.buoy.parse(raw)
      if (reading === null) return
      await writer.upsertBuoy(reading)
      written.buoy = true
    }),
  ])

  try {
    const existing = new Map((await writer.health()).map((h) => [h.source, h]))
    const merged: SourceHealthView[] = outcomes.map(({ source, ok, error }) => {
      const prev = existing.get(source)
      return {
        source,
        lastAttemptAt: nowIso,
        lastSuccessAt: ok ? nowIso : (prev?.lastSuccessAt ?? null),
        lastError: ok ? null : error,
      }
    })
    await writer.upsertSourceHealth(merged)
  } catch (err) {
    log?.(`conditions health write failed: ${describeError(err)}`)
  }

  return { attemptedAt: nowIso, sources: outcomes, written }
}
