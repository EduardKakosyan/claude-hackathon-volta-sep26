import { HALIFAX_BUOY, type BuoyReading } from '@/lib/conditions'
import { SourceParseError } from '@/lib/ingest/errors'
import { fetchText } from '@/lib/ingest/http'

/**
 * SmartAtlantic's "Halifax (Herring Cove)" buoy through its ERDDAP tabledap
 * endpoint: the last six hours of `surface_temp_avg`, newest non-null wins.
 *
 * Two things the feed does that the obvious query does not expect:
 *  - `time>=now-6hours` is refused with a 404: ERDDAP types this dataset's
 *    `time` column as a String, so the bound must be an explicit ISO instant;
 *  - `surface_temp_avg` is null for stretches (every row was null when the
 *    fixture was captured). A null reading is stored as null and the water
 *    figure simply disappears; nothing is interpolated.
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
  })
}

interface ErddapTable {
  table?: { columnNames?: unknown; rows?: unknown }
}

/**
 * The newest row with a water temperature, or the newest row at all with a
 * null temperature when the sensor reported gaps throughout. Zero rows is a
 * parse failure: the previous reading stays.
 */
export function parseErddap(raw: string): BuoyReading {
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
  if (readings.length === 0) throw new SourceParseError('SmartAtlantic: no readings in the window')

  const newestValue = [...readings].reverse().find((r) => r.temp !== null)
  const pick = newestValue ?? readings[readings.length - 1]
  return {
    buoy: HALIFAX_BUOY.id,
    waterTempC: pick.temp,
    observedAt: new Date(pick.time).toISOString(),
  }
}
