import { HALIFAX_BUOY, type BuoyReading } from '@/lib/conditions'
import { SourceParseError } from '@/lib/ingest/errors'
import { fetchText } from '@/lib/ingest/http'

/**
 * SmartAtlantic's "Halifax (Herring Cove)" buoy through its ERDDAP tabledap
 * endpoint: the last six hours of `surface_temp_avg`, newest non-null wins.
 *
 * Three things the feed does that the obvious query does not expect:
 *  - `time>=now-6hours` is refused with a 404: ERDDAP types this dataset's
 *    `time` column as a String, so the bound must be an explicit ISO instant;
 *  - `surface_temp_avg` is null for stretches (every row was null when the
 *    fixture was captured). A null reading is stored as null and the water
 *    figure simply disappears; nothing is interpolated;
 *  - a window with no rows at all is also a 404, "Your query produced no
 *    matching results" (the buoy was nine hours behind the clock on the first
 *    production refresh). That is the feed answering, not failing: the read
 *    counts as healthy, nothing is written, and the previous reading ages
 *    out of the page on its own (BUOY_STALE_AFTER_MS in lib/conditions).
 *
 * CC BY 4.0: credited in the footer.
 */
export const SMARTATLANTIC_DATASET_URL = 'https://www.smartatlantic.ca/erddap/tabledap/SMA_halifax.json'
export const SMARTATLANTIC_CREDIT_URL = 'https://www.smartatlantic.ca/'
export const BUOY_WINDOW_HOURS = 6

const COLUMNS = ['time', 'surface_temp_avg', 'wind_spd_avg', 'air_temp_avg'] as const

/** The tabledap query for the readings since `now` − BUOY_WINDOW_HOURS. */
export function buoyUrl(now: Date = new Date()): string {
  const since = new Date(now.getTime() - BUOY_WINDOW_HOURS * 60 * 60 * 1000)
  const bound = since.toISOString().replace(/\.\d{3}Z$/, 'Z')
  // ERDDAP reads the constraint out of the raw query string; `time>=` must not be form-encoded.
  return `${SMARTATLANTIC_DATASET_URL}?${COLUMNS.join(',')}&time%3E=${bound}`
}

export async function fetchBuoy(opts?: { now?: Date; fetchImpl?: typeof fetch }): Promise<string> {
  return fetchText(buoyUrl(opts?.now), {
    fetchImpl: opts?.fetchImpl,
    headers: { accept: 'application/json' },
    acceptStatus: [404],
  })
}

/** ERDDAP's body for a constraint that matches nothing. Any other 404 body is still a failure. */
const NO_MATCHING_RESULTS = /Your query produced no matching results/

interface ErddapTable {
  table?: { columnNames?: unknown; rows?: unknown }
}

/**
 * The newest row with a water temperature, or the newest row at all with a
 * null temperature when the sensor reported gaps throughout. An empty window
 * (ERDDAP's "no matching results", or a table with no rows) is null: the
 * feed answered and there is nothing to write.
 */
export function parseErddap(raw: string): BuoyReading | null {
  if (NO_MATCHING_RESULTS.test(raw)) return null
  let payload: ErddapTable
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new SourceParseError('SmartAtlantic: response is not JSON')
  }
  const names = payload.table?.columnNames
  const rows = payload.table?.rows
  if (!Array.isArray(names) || !Array.isArray(rows)) {
    throw new SourceParseError('SmartAtlantic: no table in response')
  }
  const timeIdx = names.indexOf('time')
  const tempIdx = names.indexOf('surface_temp_avg')
  if (timeIdx === -1 || tempIdx === -1) {
    throw new SourceParseError('SmartAtlantic: time or surface_temp_avg column missing')
  }

  const readings = (rows as unknown[][])
    .map((row) => ({ time: row[timeIdx], temp: row[tempIdx] }))
    .filter((r): r is { time: string; temp: number | null } => {
      return (
        typeof r.time === 'string' &&
        Number.isFinite(new Date(r.time).getTime()) &&
        (r.temp === null || (typeof r.temp === 'number' && Number.isFinite(r.temp)))
      )
    })
    .sort((a, b) => a.time.localeCompare(b.time))
  if (readings.length === 0) return null

  const newestValue = [...readings].reverse().find((r) => r.temp !== null)
  const pick = newestValue ?? readings[readings.length - 1]
  return {
    buoy: HALIFAX_BUOY.id,
    waterTempC: pick.temp,
    observedAt: new Date(pick.time).toISOString(),
  }
}
